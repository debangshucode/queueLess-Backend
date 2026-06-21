import { IsUUID, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvoiceDto {
  @ApiProperty({
    description: 'UUID of the active cart session to checkout',
    example: 'd9b23b3d-1a82-4c28-971a-e8f000b21a32',
  })
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @ApiPropertyOptional({
    description: 'Optional discount amount to apply to the invoice total',
    example: 5.0,
    nullable: true,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;

  @ApiPropertyOptional({
    description: 'Optional tax amount (e.g. GST) to apply to the invoice total',
    example: 9.0,
    nullable: true,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  taxAmount?: number;
}
