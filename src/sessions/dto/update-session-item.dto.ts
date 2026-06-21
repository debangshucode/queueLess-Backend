import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSessionItemDto {
  @ApiProperty({
    description: 'New quantity of the product in the session cart',
    example: 3,
  })
  @IsInt()
  @Min(1)
  quantity: number;
}
