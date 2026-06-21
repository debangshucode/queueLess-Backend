import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address of the account to recover',
    example: 'john.doe@abcfashion.com',
  })
  @IsEmail()
  email: string;
}
