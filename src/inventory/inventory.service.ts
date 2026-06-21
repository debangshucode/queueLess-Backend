import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { InventoryTransaction } from './entities/inventory-transaction.entity';
import { Product } from '../products/entities/product.entity';
import { TenantContext } from '../common/interceptors/tenant.interceptor';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    private readonly auditLogsService: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  async adjustStock(
    dto: AdjustInventoryDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<Inventory> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: dto.productId },
      });

      if (!product) {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          `Product with ID ${dto.productId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      if (
        !isSuperAdmin &&
        product.organizationId !== tenantContext.organizationId
      ) {
        throw new AppException(
          ErrorCode.FORBIDDEN_RESOURCE,
          'You do not have access to this product',
          HttpStatus.FORBIDDEN,
        );
      }

      if (!product.inventoryEnabled) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          'Inventory tracking is not enabled for this product',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Find or create Inventory record
      let inventory = await queryRunner.manager.findOne(Inventory, {
        where: { productId: product.id },
      });

      if (!inventory) {
        inventory = queryRunner.manager.create(Inventory, {
          productId: product.id,
          currentQuantity: 0,
        });
        inventory = await queryRunner.manager.save(Inventory, inventory);
      }

      // Create Transaction
      const transaction = queryRunner.manager.create(InventoryTransaction, {
        organizationId: product.organizationId,
        productId: product.id,
        type: dto.type,
        quantity: dto.quantity,
        remarks: dto.remarks || null,
        createdBy: actorUserId,
      });

      await queryRunner.manager.save(InventoryTransaction, transaction);

      // Adjust Cache
      inventory.currentQuantity += dto.quantity;
      const savedInventory = await queryRunner.manager.save(
        Inventory,
        inventory,
      );

      await queryRunner.commitTransaction();

      // Log action
      await this.auditLogsService.logAction(
        actorUserId,
        product.organizationId,
        tenantContext.storeId,
        'INVENTORY_ADJUSTED',
        'inventory',
        savedInventory.id,
        { dto },
      );

      return savedInventory;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getStockLevel(
    productId: string,
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Inventory> {
    const product = await this.dataSource.getRepository(Product).findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Product with ID ${productId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      !isSuperAdmin &&
      product.organizationId !== tenantContext.organizationId
    ) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'You do not have access to this product',
        HttpStatus.FORBIDDEN,
      );
    }

    let inventory = await this.inventoryRepository.findOne({
      where: { productId },
      relations: ['product'],
    });

    if (!inventory) {
      // Return a temporary/mock unsaved instance with quantity 0
      inventory = this.inventoryRepository.create({
        productId,
        currentQuantity: 0,
        product,
      });
    }

    return inventory;
  }

  async getTransactionHistory(
    productId: string,
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<InventoryTransaction[]> {
    const product = await this.dataSource.getRepository(Product).findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Product with ID ${productId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      !isSuperAdmin &&
      product.organizationId !== tenantContext.organizationId
    ) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'You do not have access to this product',
        HttpStatus.FORBIDDEN,
      );
    }

    return this.transactionRepository.find({
      where: { productId },
      order: { createdAt: 'DESC' },
      relations: ['creator'],
    });
  }
}
