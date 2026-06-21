import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStoreDto {
  @ApiProperty({
    description: 'Name of the store branch',
    example: 'Park Street Branch',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Unique store identifier/code within organization',
    example: 'PARK-001',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({
    description: 'Physical address of the store branch',
    example: 'Park Street, Building A',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number of the store branch',
    example: '+15559090',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description:
      'Organization ID owner context. Ignored for standard tenant users but can be supplied explicitly by SUPER_ADMIN.',
    example: 'd9b1db3b-8d1e-4cb2-8356-9a259c63b865',
  })
  @IsUUID()
  @IsOptional()
  organizationId?: string;
}
