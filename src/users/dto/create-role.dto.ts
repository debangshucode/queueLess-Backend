import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Name of the role (e.g. MANAGER, CASHIER)',
    example: 'MANAGER',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'A brief description of the role responsibilities',
    example: 'Store level manager with inventory and checkout approvals',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'List of permission scope names to bind to this role',
    example: ['invoice.create', 'payment.take', 'dashboard.read'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionNames?: string[];
}
