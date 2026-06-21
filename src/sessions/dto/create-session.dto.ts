import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiPropertyOptional({
    description:
      'Identifier for the customer (e.g. email, phone, name or membership number)',
    example: 'cust_987654321',
  })
  @IsString()
  @IsOptional()
  customerId?: string;
}
