import { IsUUID, IsNotEmpty, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddSessionItemDto {
  @ApiProperty({
    description: 'UUID of the product to add to the session cart',
    example: 'd9b23b3d-1a82-4c28-971a-e8f000b21a32',
  })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'Quantity of the product to add',
    example: 1,
  })
  @IsInt()
  @Min(1)
  quantity: number;
}
