import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Full name of the employee',
    example: 'Alice Attendant',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Corporate/login email address for the employee',
    example: 'alice@abcfashion.com',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Phone number of the employee',
    example: '+15554444',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    description: 'Account login password (minimum 6 characters)',
    example: 'attendantpass123',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiProperty({
    description: 'Assign role identifier to the employee',
    example: 'ATTENDANT',
    enum: ['ORGANIZATION', 'MANAGER', 'ATTENDANT', 'SECURITY'],
  })
  @IsString()
  @IsNotEmpty()
  roleName: string;

  @ApiPropertyOptional({
    description: 'Scope employee to a specific store ID',
    example: 'e0d7c71d-5b32-4d0a-9d95-e215f79ab2ef',
  })
  @IsString()
  @IsOptional()
  storeId?: string;
}
