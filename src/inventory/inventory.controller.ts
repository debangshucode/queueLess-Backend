import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
  Res,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import type { Response } from 'express';
import * as XLSX from 'xlsx';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  TenantInterceptor,
  TenantContext,
} from '../common/interceptors/tenant.interceptor';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Inventory Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Permissions('dashboard.read') // Restricted to Manager and Organization Owner
  @Post('adjust')
  @ApiOperation({
    summary:
      'Manually adjust stock level for a product (Restricted to Managers / Owners)',
  })
  @ApiResponse({
    status: 200,
    description: 'Inventory stock level adjusted successfully.',
  })
  async adjustStock(
    @Body() dto: AdjustInventoryDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.inventoryService.adjustStock(
      dto,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('dashboard.read') // Restricted to Manager and Organization Owner
  @Get('export')
  @ApiOperation({ summary: 'Export inventory status as CSV or Excel' })
  async exportInventory(
    @Query('format') format: 'csv' | 'xlsx',
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
    @Res() res: Response,
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const rows = await this.inventoryService.exportInventory(tenant, isSuperAdmin);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');

    const exportFormat = format === 'csv' ? 'csv' : 'xlsx';

    if (exportFormat === 'csv') {
      const csvContent = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=inventory-${Date.now()}.csv`);
      res.send(csvContent);
    } else {
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=inventory-${Date.now()}.xlsx`);
      res.send(buffer);
    }
  }

  @Permissions('session.update') // Allowed for attendants to query stock levels during cart additions
  @Get('product/:productId')
  @ApiOperation({
    summary: 'Get current stock level and cache status for a product',
  })
  async getStockLevel(
    @Param('productId') productId: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.inventoryService.getStockLevel(productId, tenant, isSuperAdmin);
  }

  @Permissions('dashboard.read') // Restricted to Manager and Organization Owner
  @Get('product/:productId/transactions')
  @ApiOperation({
    summary: 'Get audit history of all inventory transactions for a product',
  })
  async getTransactionHistory(
    @Param('productId') productId: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.inventoryService.getTransactionHistory(
      productId,
      tenant,
      isSuperAdmin,
    );
  }
}
