import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategory } from './entities/product-category.entity';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Inventory } from '../inventory/entities/inventory.entity';
import { InventoryTransaction } from '../inventory/entities/inventory-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductCategory,
      Product,
      Inventory,
      InventoryTransaction,
    ]),
    AuditLogsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
