import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductCategory } from './entities/product-category.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import {
  InventoryTransaction,
  InventoryTransactionType,
} from '../inventory/entities/inventory-transaction.entity';
import { TenantContext } from '../common/interceptors/tenant.interceptor';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import * as XLSX from 'xlsx';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    private readonly auditLogsService: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  // CATEGORIES LOGIC
  async createCategory(
    dto: CreateCategoryDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
    orgIdOverride?: string,
  ): Promise<ProductCategory> {
    const organizationId =
      isSuperAdmin && orgIdOverride
        ? orgIdOverride
        : tenantContext.organizationId;
    if (!organizationId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization ID is required to create a category',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.categoryRepository.findOne({
      where: { name: dto.name, organizationId },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        `Category with name ${dto.name} already exists`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const category = this.categoryRepository.create({
      name: dto.name,
      description: dto.description,
      organizationId,
      isActive: true,
    });

    const saved = await this.categoryRepository.save(category);

    await this.auditLogsService.logAction(
      actorUserId,
      organizationId,
      tenantContext.storeId,
      'CATEGORY_CREATED',
      'product_categories',
      saved.id,
      { dto },
    );

    return saved;
  }

  async findAllCategories(
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<ProductCategory[]> {
    if (isSuperAdmin) {
      return this.categoryRepository.find({ relations: ['products'] });
    }
    return this.categoryRepository.find({
      where: { organizationId: tenantContext.organizationId || undefined },
      relations: ['products'],
    });
  }

  // PRODUCTS LOGIC
  async create(
    dto: CreateProductDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
    orgIdOverride?: string,
  ): Promise<Product> {
    const organizationId =
      isSuperAdmin && orgIdOverride
        ? orgIdOverride
        : tenantContext.organizationId;
    if (!organizationId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization ID is required to create a product',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check SKU unique
    const existingSku = await this.productRepository.findOne({
      where: { sku: dto.sku, organizationId },
    });
    if (existingSku) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        `Product with SKU ${dto.sku} already exists`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check Barcode unique
    if (dto.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: dto.barcode, organizationId },
      });
      if (existingBarcode) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          `Product with barcode ${dto.barcode} already exists`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Check Category exists
    if (dto.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: dto.categoryId, organizationId },
      });
      if (!category) {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          `Category with ID ${dto.categoryId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = queryRunner.manager.create(Product, {
        name: dto.name,
        sku: dto.sku,
        price: dto.price,
        categoryId: dto.categoryId || null,
        barcode: dto.barcode || null,
        description: dto.description || null,
        inventoryEnabled: dto.inventoryEnabled ?? false,
        organizationId,
        isActive: dto.isActive ?? true,
      });

      const savedProduct = await queryRunner.manager.save(Product, product);

      const initialStock = dto.initialStock ?? 0;
      if (initialStock > 0 || dto.inventoryEnabled) {
        const inventory = queryRunner.manager.create(Inventory, {
          productId: savedProduct.id,
          currentQuantity: initialStock,
        });
        await queryRunner.manager.save(Inventory, inventory);

        if (initialStock > 0) {
          const transaction = queryRunner.manager.create(InventoryTransaction, {
            organizationId,
            productId: savedProduct.id,
            type: InventoryTransactionType.OPENING_STOCK,
            quantity: initialStock,
            referenceId: savedProduct.id,
            remarks: 'Initial stock during product creation',
            createdBy: actorUserId,
          });
          await queryRunner.manager.save(InventoryTransaction, transaction);
        }
      }

      await queryRunner.commitTransaction();

      await this.auditLogsService.logAction(
        actorUserId,
        organizationId,
        tenantContext.storeId,
        'PRODUCT_CREATED',
        'products',
        savedProduct.id,
        { dto },
      );

      return savedProduct;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Product[]> {
    if (isSuperAdmin) {
      return this.productRepository.find({ relations: ['category'] });
    }
    return this.productRepository.find({
      where: { organizationId: tenantContext.organizationId || undefined },
      relations: ['category'],
    });
  }

  async exportCatalog(
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<any[]> {
    const products = await this.findAll(tenantContext, isSuperAdmin);
    return products.map((p) => ({
      Name: p.name,
      SKU: p.sku,
      Barcode: p.barcode || '',
      Price: p.price,
      Category: p.category ? p.category.name : '',
      'Inventory Enabled': p.inventoryEnabled ? 'Yes' : 'No',
    }));
  }

  async findOne(
    id: string,
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });

    if (!product) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Product with ID ${id} not found`,
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

    return product;
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<Product> {
    const product = await this.findOne(id, tenantContext, isSuperAdmin);

    // If SKU changed, check uniqueness
    if (dto.sku && dto.sku !== product.sku) {
      const existingSku = await this.productRepository.findOne({
        where: { sku: dto.sku, organizationId: product.organizationId },
      });
      if (existingSku) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          `Product with SKU ${dto.sku} already exists`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // If Barcode changed, check uniqueness
    if (dto.barcode && dto.barcode !== product.barcode) {
      const existingBarcode = await this.productRepository.findOne({
        where: { barcode: dto.barcode, organizationId: product.organizationId },
      });
      if (existingBarcode) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          `Product with barcode ${dto.barcode} already exists`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Check Category exists
    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: dto.categoryId, organizationId: product.organizationId },
      });
      if (!category) {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          `Category with ID ${dto.categoryId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const updatedProduct = queryRunner.manager.merge(Product, product, {
        name: dto.name,
        sku: dto.sku,
        price: dto.price,
        categoryId:
          dto.categoryId === null ? null : dto.categoryId || product.categoryId,
        barcode: dto.barcode === null ? null : dto.barcode || product.barcode,
        description:
          dto.description === null
            ? null
            : dto.description || product.description,
        inventoryEnabled: dto.inventoryEnabled ?? product.inventoryEnabled,
        isActive: dto.isActive ?? product.isActive,
      });

      const saved = await queryRunner.manager.save(Product, updatedProduct);

      // If inventory gets enabled later, and there's no inventory record yet, create it
      if (dto.inventoryEnabled && !product.inventoryEnabled) {
        let inventory = await queryRunner.manager.findOne(Inventory, {
          where: { productId: saved.id },
        });
        if (!inventory) {
          inventory = queryRunner.manager.create(Inventory, {
            productId: saved.id,
            currentQuantity: 0,
          });
          await queryRunner.manager.save(Inventory, inventory);
        }
      }

      await queryRunner.commitTransaction();

      await this.auditLogsService.logAction(
        actorUserId,
        product.organizationId,
        tenantContext.storeId,
        'PRODUCT_UPDATED',
        'products',
        saved.id,
        { dto },
      );

      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(
    id: string,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<boolean> {
    const product = await this.findOne(id, tenantContext, isSuperAdmin);

    await this.productRepository.remove(product);

    await this.auditLogsService.logAction(
      actorUserId,
      product.organizationId,
      tenantContext.storeId,
      'PRODUCT_DELETED',
      'products',
      id,
    );

    return true;
  }

  async search(
    query: string,
    tenantContext: TenantContext,
  ): Promise<Product[]> {
    if (!tenantContext.organizationId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization ID is required for searching products',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.productRepository.find({
      where: [
        {
          organizationId: tenantContext.organizationId,
          name: ILike(`%${query}%`),
        },
        {
          organizationId: tenantContext.organizationId,
          sku: ILike(`%${query}%`),
        },
      ],
      relations: ['category'],
    });
  }

  async findByBarcode(
    barcode: string,
    tenantContext: TenantContext,
  ): Promise<Product> {
    if (!tenantContext.organizationId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization ID is required for barcode lookup',
        HttpStatus.BAD_REQUEST,
      );
    }

    const product = await this.productRepository.findOne({
      where: { organizationId: tenantContext.organizationId, barcode },
      relations: ['category'],
    });

    if (!product) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Product with barcode ${barcode} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    return product;
  }

  // BULK IMPORT LOGIC
  async importProducts(
    fileBuffer: Buffer,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
    orgIdOverride?: string,
  ): Promise<Product[]> {
    const organizationId =
      isSuperAdmin && orgIdOverride
        ? orgIdOverride
        : tenantContext.organizationId;
    if (!organizationId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization ID is required for product import',
        HttpStatus.BAD_REQUEST,
      );
    }

    interface ImportRow {
      name?: string | number;
      Name?: string | number;
      NAME?: string | number;
      sku?: string | number;
      SKU?: string | number;
      Sku?: string | number;
      price?: string | number;
      Price?: string | number;
      PRICE?: string | number;
      barcode?: string | number;
      Barcode?: string | number;
      BARCODE?: string | number;
      category?: string | number;
      Category?: string | number;
      CATEGORY?: string | number;
      description?: string | number;
      Description?: string | number;
      DESCRIPTION?: string | number;
      inventoryEnabled?: boolean | string | number;
      inventory_enabled?: boolean | string | number;
      InventoryEnabled?: boolean | string | number;
      stock?: string | number;
      Stock?: string | number;
      initialStock?: string | number;
      initial_stock?: string | number;
      quantity?: string | number;
      Quantity?: string | number;
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<ImportRow>(worksheet);

    const importedProducts: Product[] = [];
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const row of rows) {
        const name = row.name || row.Name || row.NAME;
        const sku = row.sku || row.SKU || row.Sku;
        const priceStr = row.price || row.Price || row.PRICE;
        const barcode = row.barcode || row.Barcode || row.BARCODE || null;
        const categoryName =
          row.category || row.Category || row.CATEGORY || null;
        const description =
          row.description || row.Description || row.DESCRIPTION || null;
        const inventoryEnabledStr =
          row.inventoryEnabled ||
          row.inventory_enabled ||
          row.InventoryEnabled ||
          false;
        const stockStr =
          row.stock ||
          row.Stock ||
          row.initialStock ||
          row.initial_stock ||
          row.quantity ||
          row.Quantity ||
          0;

        if (!name || !sku || priceStr === undefined) {
          continue; // Skip invalid rows
        }

        const price = Number(priceStr);
        const initialStock = Math.floor(Number(stockStr)) || 0;
        const inventoryEnabled =
          String(inventoryEnabledStr).toLowerCase() === 'true' ||
          inventoryEnabledStr === true ||
          inventoryEnabledStr === 1 ||
          inventoryEnabledStr === '1';

        // Get or Create category
        let categoryId: string | null = null;
        if (categoryName) {
          const catName = String(categoryName).trim();
          let category = await queryRunner.manager.findOne(ProductCategory, {
            where: { name: catName, organizationId },
          });
          if (!category) {
            category = queryRunner.manager.create(ProductCategory, {
              name: catName,
              organizationId,
              isActive: true,
            });
            category = await queryRunner.manager.save(
              ProductCategory,
              category,
            );
          }
          categoryId = category.id;
        }

        // Check if SKU exists
        const existingSku = await queryRunner.manager.findOne(Product, {
          where: { sku: String(sku).trim(), organizationId },
        });
        if (existingSku) {
          throw new AppException(
            ErrorCode.BAD_REQUEST,
            `Product with SKU ${sku} already exists in this organization`,
            HttpStatus.BAD_REQUEST,
          );
        }

        // Check if Barcode exists
        if (barcode) {
          const existingBarcode = await queryRunner.manager.findOne(Product, {
            where: { barcode: String(barcode).trim(), organizationId },
          });
          if (existingBarcode) {
            throw new AppException(
              ErrorCode.BAD_REQUEST,
              `Product with barcode ${barcode} already exists in this organization`,
              HttpStatus.BAD_REQUEST,
            );
          }
        }

        // Create Product
        const product = queryRunner.manager.create(Product, {
          name: String(name).trim(),
          sku: String(sku).trim(),
          price,
          categoryId,
          barcode: barcode ? String(barcode).trim() : null,
          description: description ? String(description).trim() : null,
          inventoryEnabled,
          organizationId,
          isActive: true,
        });

        const savedProduct = await queryRunner.manager.save(Product, product);

        // Create Inventory & opening stock if needed
        if (initialStock > 0 || inventoryEnabled) {
          const inventory = queryRunner.manager.create(Inventory, {
            productId: savedProduct.id,
            currentQuantity: initialStock,
          });
          await queryRunner.manager.save(Inventory, inventory);

          if (initialStock > 0) {
            const transaction = queryRunner.manager.create(
              InventoryTransaction,
              {
                organizationId,
                productId: savedProduct.id,
                type: InventoryTransactionType.OPENING_STOCK,
                quantity: initialStock,
                referenceId: savedProduct.id,
                remarks: 'Imported initial stock',
                createdBy: actorUserId,
              },
            );
            await queryRunner.manager.save(InventoryTransaction, transaction);
          }
        }

        importedProducts.push(savedProduct);
      }

      await queryRunner.commitTransaction();

      await this.auditLogsService.logAction(
        actorUserId,
        organizationId,
        tenantContext.storeId,
        'PRODUCTS_IMPORTED',
        'products',
        null,
        { count: importedProducts.length },
      );

      return importedProducts;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
