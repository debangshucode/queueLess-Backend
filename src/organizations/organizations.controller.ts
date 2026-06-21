import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@ApiTags('Organizations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Permissions('organization.create')
  @Post()
  @ApiOperation({ summary: 'Create a new organization (Merchant)' })
  @ApiResponse({
    status: 201,
    description: 'Organization created successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires organization.create scope.',
  })
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.organizationsService.create(dto, actorUserId);
  }

  @Permissions('organization.read')
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve details of a specific organization' })
  @ApiResponse({
    status: 200,
    description: 'Organization details retrieved successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatch or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'Organization not found.' })
  async findOne(
    @Param('id') id: string,
    @Req() req: { user: { role: string; organizationId: string | null } },
  ) {
    const user = req.user;
    // Multi-tenant check: Non-SUPER_ADMIN can only view their own organization
    if (user.role !== 'SUPER_ADMIN' && user.organizationId !== id) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'Access Denied: Cannot view other organization',
        403,
      );
    }
    return this.organizationsService.findOne(id);
  }

  @Permissions('organization.update')
  @Patch(':id')
  @ApiOperation({ summary: 'Update configuration of a specific organization' })
  @ApiResponse({
    status: 200,
    description: 'Organization updated successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - mismatch or insufficient scopes.',
  })
  @ApiResponse({ status: 404, description: 'Organization not found.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser('id') actorUserId: string,
    @Req() req: { user: { role: string; organizationId: string | null } },
  ) {
    const user = req.user;
    // Multi-tenant check: Non-SUPER_ADMIN can only update their own organization
    if (user.role !== 'SUPER_ADMIN' && user.organizationId !== id) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'Access Denied: Cannot update other organization',
        403,
      );
    }
    return this.organizationsService.update(id, dto, actorUserId);
  }
}
