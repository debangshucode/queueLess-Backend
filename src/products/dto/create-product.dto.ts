import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({
    description: 'Name of the product',
    example: 'Men Slim Fit Shirt',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Stock Keeping Unit (SKU) - unique within organization',
    example: 'SHIRT-SLIM-M-001',
  })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({
    description: 'Price of the product',
    example: 49.99,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description: 'UUID of the product category',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Barcode of the product (EAN, UPC, etc.)',
    example: '8901234567890',
  })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the product',
    example: 'Premium cotton slim fit shirt for men',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether inventory tracking is enabled for this product',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  inventoryEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Initial stock level for the product (will create an inventory and OPENING_STOCK transaction)',
    example: 100,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  initialStock?: number;

  @ApiPropertyOptional({
    description: 'Is this product active and sellable',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
