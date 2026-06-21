import {
  Controller,
  Get,
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
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  TenantInterceptor,
  TenantContext,
} from '../common/interceptors/tenant.interceptor';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@ApiTags('Analytics & Dashboards')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Permissions('dashboard.read') // Accessible by Manager & Organization Owner
  @Get('performance')
  @ApiOperation({
    summary:
      'Retrieve billing performance and revenue influence details of attendants',
  })
  @ApiResponse({
    status: 200,
    description: 'Employee performance analytics retrieved successfully.',
  })
  async getEmployeePerformance(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.analyticsService.getEmployeePerformance(tenant, isSuperAdmin);
  }
}
