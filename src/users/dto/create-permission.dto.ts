import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({
    description:
      'Name of the permission scope (e.g. inventory.write, refund.approve)',
    example: 'inventory.write',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description:
      'Brief description of the action allowed by this permission scope',
    example: 'Allows modification of product catalog and stock levels',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
