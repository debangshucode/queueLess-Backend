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
  UploadedFile,
  Query,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  TenantInterceptor,
  TenantContext,
} from '../common/interceptors/tenant.interceptor';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    organizationId: string | null;
    storeId: string | null;
    role: string;
  };
}

@ApiTags('Products & Categories')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // CATEGORIES
  @Permissions('product.create')
  @Post('categories')
  @ApiOperation({ summary: 'Create a new product category' })
  @ApiResponse({ status: 201, description: 'Category created successfully.' })
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.productsService.createCategory(
      dto,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('user.read') // Allow managers/attendants to list categories
  @Get('categories')
  @ApiOperation({ summary: 'List all categories in the tenant organization' })
  async findAllCategories(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.productsService.findAllCategories(tenant, isSuperAdmin);
  }

  // PRODUCTS
  @Permissions('product.create')
  @Post()
  @ApiOperation({ summary: 'Manually create a single product' })
  @ApiResponse({ status: 201, description: 'Product created successfully.' })
  async create(
    @Body() dto: CreateProductDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.productsService.create(dto, tenant, actorUserId, isSuperAdmin);
  }

  @Permissions('product.create')
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Import products from a CSV or Excel spreadsheet file',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Products imported successfully.' })
  async importProducts(
    @UploadedFile() file: { buffer: Buffer },
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.productsService.importProducts(
      file.buffer,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('session.update')
  @Get('search')
  @ApiOperation({ summary: 'Fuzzy search products by name or SKU' })
  async search(
    @Query('q') query: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.productsService.search(query || '', tenant);
  }

  @Permissions('session.update')
  @Get('barcode/:code')
  @ApiOperation({ summary: 'Exact match barcode scanner lookup' })
  async findByBarcode(
    @Param('code') code: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.productsService.findByBarcode(code, tenant);
  }

  @Permissions('user.read')
  @Get()
  @ApiOperation({ summary: 'List all products in the organization' })
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.productsService.findAll(tenant, isSuperAdmin);
  }

  @Permissions('user.read')
  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific product' })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.productsService.findOne(id, tenant, isSuperAdmin);
  }

  @Permissions('product.create')
  @Patch(':id')
  @ApiOperation({ summary: 'Update product properties' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.productsService.update(
      id,
      dto,
      tenant,
      actorUserId,
      isSuperAdmin,
    );
  }

  @Permissions('product.create')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product permanently' })
  async remove(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser('id') actorUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    return this.productsService.remove(id, tenant, actorUserId, isSuperAdmin);
  }
}
