import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { TakePaymentDto } from './dto/take-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  TenantInterceptor,
  TenantContext,
} from '../common/interceptors/tenant.interceptor';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Payments Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Permissions('payment.take')
  @Post()
  @ApiOperation({ summary: 'Settle a pending invoice using CASH, CARD or UPI' })
  @ApiResponse({
    status: 201,
    description: 'Payment recorded and invoice marked as PAID.',
  })
  async takePayment(
    @Body() dto: TakePaymentDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.paymentsService.takePayment(
      dto,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('payment.take')
  @Get()
  @ApiOperation({ summary: 'List all payments processed' })
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.paymentsService.findAll(tenant, isSuperAdmin);
  }

  @Permissions('payment.take')
  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific payment' })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.paymentsService.findOne(id, tenant, isSuperAdmin);
  }
}
