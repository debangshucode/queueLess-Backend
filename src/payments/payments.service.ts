import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import {
  InventoryTransaction,
  InventoryTransactionType,
} from '../inventory/entities/inventory-transaction.entity';
import { TenantContext } from '../common/interceptors/tenant.interceptor';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { TakePaymentDto } from './dto/take-payment.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    private readonly auditLogsService: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  async takePayment(
    dto: TakePaymentDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const invoice = await queryRunner.manager.findOne(Invoice, {
        where: { id: dto.invoiceId },
        relations: ['items', 'items.product'],
      });

      if (!invoice) {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          `Invoice with ID ${dto.invoiceId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      if (
        !isSuperAdmin &&
        invoice.organizationId !== tenantContext.organizationId
      ) {
        throw new AppException(
          ErrorCode.FORBIDDEN_RESOURCE,
          'You do not have access to this invoice',
          HttpStatus.FORBIDDEN,
        );
      }

      if (invoice.status !== InvoiceStatus.PENDING) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          `Invoice is already in status ${invoice.status}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check amount matching
      const totalAmount = Number(invoice.totalAmount);
      const paidAmount = Number(dto.amount);
      if (Math.abs(totalAmount - paidAmount) > 0.01) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          `Payment amount (${paidAmount}) does not match invoice total amount (${totalAmount})`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // Create Payment Record (Simulating successful payment collection)
      const payment = queryRunner.manager.create(Payment, {
        invoiceId: invoice.id,
        method: dto.method,
        status: PaymentStatus.PAID,
        amount: paidAmount,
        transactionReference: dto.transactionReference || null,
        paidAt: new Date(),
      });

      const savedPayment = await queryRunner.manager.save(Payment, payment);

      // Transition Invoice Status to PAID
      invoice.status = InvoiceStatus.PAID;
      await queryRunner.manager.save(Invoice, invoice);

      // Inventory Reduction Logic for products with inventoryEnabled = true
      for (const item of invoice.items) {
        // Safe check if product relation exists and has inventory enabled
        if (item.product && item.product.inventoryEnabled) {
          // Find or create Inventory record
          let inventory = await queryRunner.manager.findOne(Inventory, {
            where: { productId: item.productId },
          });

          if (!inventory) {
            inventory = queryRunner.manager.create(Inventory, {
              productId: item.productId,
              currentQuantity: 0,
            });
            inventory = await queryRunner.manager.save(Inventory, inventory);
          }

          // Create negative-quantity SALE inventory transaction
          const transaction = queryRunner.manager.create(InventoryTransaction, {
            organizationId: invoice.organizationId,
            productId: item.productId,
            type: InventoryTransactionType.SALE,
            quantity: -item.quantity, // Negative number for sale
            referenceId: invoice.id,
            remarks: `Settle Invoice ${invoice.invoiceNumber}`,
            createdBy: actorUserId,
          });

          await queryRunner.manager.save(InventoryTransaction, transaction);

          // Update inventory quantity cache
          inventory.currentQuantity += transaction.quantity; // equivalent to -= item.quantity
          await queryRunner.manager.save(Inventory, inventory);
        }
      }

      await queryRunner.commitTransaction();

      // Log payment audit action
      await this.auditLogsService.logAction(
        actorUserId,
        invoice.organizationId,
        tenantContext.storeId,
        'PAYMENT_PROCESSED',
        'payments',
        savedPayment.id,
        { invoiceId: invoice.id, method: dto.method, amount: paidAmount },
      );

      // Return the updated payment details
      return this.findOne(savedPayment.id, tenantContext, isSuperAdmin);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findOne(
    id: string,
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['invoice'],
    });

    if (!payment) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Payment with ID ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      !isSuperAdmin &&
      payment.invoice.organizationId !== tenantContext.organizationId
    ) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'You do not have access to this payment record',
        HttpStatus.FORBIDDEN,
      );
    }

    return payment;
  }

  async findAll(
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Payment[]> {
    if (isSuperAdmin) {
      return this.paymentRepository.find({ relations: ['invoice'] });
    }

    return this.paymentRepository.find({
      where: {
        invoice: {
          organizationId: tenantContext.organizationId || undefined,
        },
      },
      relations: ['invoice'],
    });
  }
}
