import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  TenantInterceptor,
  TenantContext,
} from '../common/interceptors/tenant.interceptor';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Invoices & Checkout')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Permissions('invoice.create')
  @Post()
  @ApiOperation({
    summary:
      'Generate a new static invoice snapshot from a shopping session cart',
  })
  @ApiResponse({ status: 201, description: 'Invoice generated successfully.' })
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.invoicesService.create(dto, tenant, actorUserId, isSuperAdmin);
  }

  @Permissions('invoice.create')
  @Get()
  @ApiOperation({ summary: 'List all invoices' })
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.invoicesService.findAll(tenant, isSuperAdmin);
  }

  @Permissions('invoice.create')
  @Get(':id')
  @ApiOperation({
    summary: 'Get details of a specific invoice including items',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.invoicesService.findOne(id, tenant, isSuperAdmin);
  }

  @Permissions('receipt.verify')
  @Get('verify/search')
  @ApiOperation({ summary: 'Search invoices for receipt verification' })
  async searchForVerification(
    @Query('q') query: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.invoicesService.searchForVerification(query || '', tenant, isSuperAdmin);
  }

  @Permissions('receipt.verify')
  @Get(':id/verify-status')
  @ApiOperation({ summary: 'Get current status of invoice for exit security verification' })
  async verifyStatus(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.invoicesService.verifyStatus(id, tenant, isSuperAdmin);
  }

  @Permissions('receipt.verify')
  @Post(':id/verify')
  @ApiOperation({ summary: 'Mark receipt/invoice status as VERIFIED at exit security' })
  async verify(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.invoicesService.verify(id, tenant, actorUserId, isSuperAdmin);
  }
}
