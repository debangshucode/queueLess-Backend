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
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AddSessionItemDto } from './dto/add-session-item.dto';
import { UpdateSessionItemDto } from './dto/update-session-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  TenantInterceptor,
  TenantContext,
} from '../common/interceptors/tenant.interceptor';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Shopping Cart Sessions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Permissions('session.create')
  @Post()
  @ApiOperation({
    summary: 'Start a new customer shopping session (Creates active cart)',
  })
  @ApiResponse({ status: 201, description: 'Session started successfully.' })
  async create(
    @Body() dto: CreateSessionDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.sessionsService.create(dto, tenant, actorUserId, isSuperAdmin);
  }

  @Permissions('session.update')
  @Get()
  @ApiOperation({ summary: 'List all cart sessions' })
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.sessionsService.findAll(tenant, isSuperAdmin);
  }

  @Permissions('session.update')
  @Get(':id')
  @ApiOperation({
    summary: 'Get details and items inside a specific session cart',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.sessionsService.findOne(id, tenant, isSuperAdmin);
  }

  @Permissions('session.update')
  @Post(':id/items')
  @ApiOperation({
    summary:
      'Add a product to the cart session (Increments quantity if already exists)',
  })
  @ApiResponse({ status: 201, description: 'Product added/adjusted in cart.' })
  async addItem(
    @Param('id') sessionId: string,
    @Body() dto: AddSessionItemDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.sessionsService.addItem(
      sessionId,
      dto,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('session.update')
  @Patch(':id/items/:productId')
  @ApiOperation({ summary: 'Update product quantity in the cart session' })
  async updateItem(
    @Param('id') sessionId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateSessionItemDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.sessionsService.updateItem(
      sessionId,
      productId,
      dto,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('session.update')
  @Delete(':id/items/:productId')
  @ApiOperation({
    summary: 'Remove a product from the cart session completely',
  })
  async removeItem(
    @Param('id') sessionId: string,
    @Param('productId') productId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.sessionsService.removeItem(
      sessionId,
      productId,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }
}
