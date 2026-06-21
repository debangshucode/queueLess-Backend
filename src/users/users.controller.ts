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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  TenantInterceptor,
  TenantContext,
} from '../common/interceptors/tenant.interceptor';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Permissions('user.create')
  @Post()
  @ApiOperation({
    summary: 'Create a new user scoped to the tenant organization',
  })
  @ApiResponse({ status: 201, description: 'User created successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or email already exists.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires user.create scope.',
  })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.usersService.create(dto, tenant, actorUserId, isSuperAdmin);
  }

  @Permissions('user.read')
  @Get()
  @ApiOperation({
    summary: 'List all users belonging to the tenant organization',
  })
  @ApiResponse({
    status: 200,
    description: 'Users list retrieved successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires user.read scope.',
  })
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.usersService.findAll(tenant, isSuperAdmin);
  }

  @Permissions('user.read')
  @Get('roles/suggestions')
  @ApiOperation({
    summary: 'Get list of role names and IDs for frontend selection drop-downs',
  })
  @ApiResponse({
    status: 200,
    description: 'Role list retrieved successfully.',
  })
  async getRolesSuggestions(@Req() req: { user: { role: string } }) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.usersService.getRolesSuggestions(isSuperAdmin);
  }

  @Permissions('user.read')
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve details of a specific user' })
  @ApiResponse({
    status: 200,
    description: 'User details retrieved successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatched tenant or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.usersService.findOne(id, tenant, isSuperAdmin);
  }

  @Permissions('user.update')
  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile details' })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatched tenant or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.usersService.update(id, dto, tenant, actorUserId, isSuperAdmin);
  }

  @Permissions('user.deactivate')
  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate user account status to INACTIVE' })
  @ApiResponse({
    status: 200,
    description: 'User status successfully set to INACTIVE.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - cannot deactivate own account.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatched tenant or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async deactivate(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.usersService.deactivate(id, tenant, actorUserId, isSuperAdmin);
  }

  @Permissions('user.update')
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update status of a specific user (ACTIVE, INACTIVE, SUSPENDED)',
  })
  @ApiResponse({
    status: 200,
    description: 'User status updated successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - cannot modify own status.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatched tenant or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.usersService.updateStatus(
      id,
      dto.status,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('user.deactivate')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete user account permanently' })
  @ApiResponse({ status: 200, description: 'User deleted successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - cannot delete own account.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatched tenant or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async remove(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.usersService.remove(id, tenant, actorUserId, isSuperAdmin);
  }

  @Permissions('user.role_assign')
  @Post(':id/roles')
  @ApiOperation({ summary: 'Re-assign user role' })
  @ApiResponse({ status: 200, description: 'Role assigned successfully.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatched tenant or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'User or Role not found.' })
  async assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string } },
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.usersService.assignRole(
      id,
      dto.roleName,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('user.role_assign')
  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new custom access Role' })
  @ApiResponse({ status: 201, description: 'Role created successfully.' })
  @ApiResponse({ status: 400, description: 'Role name already exists.' })
  async createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.usersService.createRole(dto, actorUserId);
  }

  @Permissions('user.role_assign')
  @Post('permissions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new Permission scope' })
  @ApiResponse({ status: 201, description: 'Permission created successfully.' })
  @ApiResponse({ status: 400, description: 'Permission scope already exists.' })
  async createPermission(
    @Body() dto: CreatePermissionDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.usersService.createPermission(dto, actorUserId);
  }
}
