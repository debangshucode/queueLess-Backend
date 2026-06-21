import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({
    description: 'The name of the organization (merchant)',
    example: 'ABC Fashion',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Contact email address of the organization',
    example: 'contact@abcfashion.com',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Contact phone number of the organization',
    example: '+15550101',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Subscription plan level',
    example: 'FREE',
    default: 'FREE',
  })
  @IsString()
  @IsOptional()
  subscriptionPlan?: string;
}
