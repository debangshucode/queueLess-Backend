import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRoleDto {
  @ApiProperty({
    description: 'Target role name to assign',
    example: 'MANAGER',
    enum: ['ORGANIZATION', 'MANAGER', 'ATTENDANT', 'SECURITY'],
  })
  @IsString()
  @IsNotEmpty()
  roleName: string;
}
