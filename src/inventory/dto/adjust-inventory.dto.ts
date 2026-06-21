import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryTransactionType } from '../entities/inventory-transaction.entity';

export class AdjustInventoryDto {
  @ApiProperty({
    description: 'UUID of the product whose stock is being adjusted',
    example: 'd9b23b3d-1a82-4c28-971a-e8f000b21a32',
  })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'Type of inventory transaction adjustment',
    enum: [
      InventoryTransactionType.PURCHASE,
      InventoryTransactionType.RETURN,
      InventoryTransactionType.ADJUSTMENT,
    ],
    example: InventoryTransactionType.ADJUSTMENT,
  })
  @IsEnum([
    InventoryTransactionType.PURCHASE,
    InventoryTransactionType.RETURN,
    InventoryTransactionType.ADJUSTMENT,
  ])
  @IsNotEmpty()
  type: InventoryTransactionType;

  @ApiProperty({
    description:
      'Quantity to adjust by (positive to increase stock, negative to decrease)',
    example: 10,
  })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({
    description: 'Optional remarks detailing the adjustment reason',
    example: 'Damaged stock returned',
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}
