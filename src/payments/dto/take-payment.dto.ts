import {
  IsUUID,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../entities/payment.entity';

export class TakePaymentDto {
  @ApiProperty({
    description: 'UUID of the invoice to settle',
    example: 'd9b23b3d-1a82-4c28-971a-e8f000b21a32',
  })
  @IsUUID()
  @IsNotEmpty()
  invoiceId: string;

  @ApiProperty({
    description: 'Payment method used for the checkout',
    enum: PaymentMethod,
    example: PaymentMethod.UPI,
  })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  method: PaymentMethod;

  @ApiProperty({
    description: 'The exact amount paid (must match invoice total amount)',
    example: 54.0,
  })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    description: 'Optional reference ID from the gateway or cashier',
    example: 'ref_tx_998877',
  })
  @IsString()
  @IsOptional()
  transactionReference?: string;
}
