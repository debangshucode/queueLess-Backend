import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterMerchantDto {
  @ApiProperty({
    description: 'The name of the merchant organization',
    example: 'ABC Fashion',
  })
  @IsString()
  @IsNotEmpty()
  merchantName: string;

  @ApiProperty({
    description: 'Email address of the merchant organization',
    example: 'contact@abcfashion.com',
  })
  @IsEmail()
  merchantEmail: string;

  @ApiPropertyOptional({
    description: 'Phone number of the merchant organization',
    example: '+15550101',
  })
  @IsString()
  @IsOptional()
  merchantPhone?: string;

  @ApiProperty({
    description: 'Full name of the organization admin employee',
    example: 'John Doe Admin',
  })
  @IsString()
  @IsNotEmpty()
  adminName: string;

  @ApiProperty({
    description: 'Login/corporate email address for the admin user',
    example: 'john.doe@abcfashion.com',
  })
  @IsEmail()
  adminEmail: string;

  @ApiPropertyOptional({
    description: 'Phone number of the admin user',
    example: '+15550102',
  })
  @IsString()
  @IsOptional()
  adminPhone?: string;

  @ApiProperty({
    description: 'Password for the admin login account (minimum 6 characters)',
    example: 'password123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  adminPassword: string;
}
