import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  TenantInterceptor,
  TenantContext,
} from '../common/interceptors/tenant.interceptor';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Stores')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Permissions('store.create')
  @Post()
  @ApiOperation({ summary: 'Create a new store' })
  @ApiResponse({ status: 201, description: 'Store created successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or duplicate code.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires store.create scope.',
  })
  async create(
    @Body() dto: CreateStoreDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.storesService.create(dto, tenant, actorUserId, isSuperAdmin);
  }

  @Permissions('store.read')
  @Get()
  @ApiOperation({ summary: 'List all stores within the tenant organization' })
  @ApiResponse({ status: 200, description: 'Stores retrieved successfully.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires store.read scope.',
  })
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.storesService.findAll(tenant, isSuperAdmin);
  }

  @Permissions('store.read')
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve details of a specific store' })
  @ApiResponse({
    status: 200,
    description: 'Store details retrieved successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatched tenant or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'Store not found.' })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.storesService.findOne(id, tenant, isSuperAdmin);
  }

  @Permissions('store.update')
  @Patch(':id')
  @ApiOperation({ summary: 'Update details of a specific store' })
  @ApiResponse({ status: 200, description: 'Store updated successfully.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatched tenant or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'Store not found.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.storesService.update(
      id,
      dto,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('store.delete')
  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a specific store' })
  @ApiResponse({ status: 200, description: 'Store soft deleted successfully.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatched tenant or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'Store not found.' })
  async remove(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.storesService.remove(id, tenant, actorUserId, isSuperAdmin);
  }
}
