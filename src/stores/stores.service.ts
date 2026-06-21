import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Store } from './entities/store.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { TenantContext } from '../common/interceptors/tenant.interceptor';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { StoreStatus } from './enums/store-status.enum';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    dto: CreateStoreDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<Store> {
    // Determine which organization the store belongs to
    let organizationId = tenantContext.organizationId;
    if (isSuperAdmin && dto.organizationId) {
      organizationId = dto.organizationId;
    }

    if (!organizationId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization ID is required to create a store',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check code uniqueness
    const existing = await this.storeRepository.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        `Store with code ${dto.code} already exists`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const store = this.storeRepository.create({
      name: dto.name,
      code: dto.code,
      address: dto.address,
      phone: dto.phone,
      organizationId,
      status: StoreStatus.ACTIVE,
    });

    const saved = await this.storeRepository.save(store);

    await this.auditLogsService.logAction(
      actorUserId,
      organizationId,
      saved.id,
      'STORE_CREATED',
      'stores',
      saved.id,
      { dto },
    );

    return saved;
  }

  async findAll(
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Store[]> {
    if (isSuperAdmin) {
      return this.storeRepository.find();
    }

    // Non-super-admins are filtered by their organizationId
    return this.storeRepository.find({
      where: { organizationId: tenantContext.organizationId || undefined },
    });
  }

  async findOne(
    id: string,
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Store> {
    const whereClause: FindOptionsWhere<Store> = { id };
    if (!isSuperAdmin) {
      whereClause.organizationId = tenantContext.organizationId || undefined;
    }

    const store = await this.storeRepository.findOne({ where: whereClause });
    if (!store) {
      throw new AppException(
        ErrorCode.STORE_NOT_FOUND,
        'Store not found or access denied',
        HttpStatus.NOT_FOUND,
      );
    }
    return store;
  }

  async update(
    id: string,
    dto: UpdateStoreDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<Store> {
    const store = await this.findOne(id, tenantContext, isSuperAdmin);

    // If code is being changed, ensure it's unique
    if (dto.code && dto.code !== store.code) {
      const existing = await this.storeRepository.findOne({
        where: { code: dto.code },
      });
      if (existing) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          `Store with code ${dto.code} already exists`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    Object.assign(store, dto);
    const saved = await this.storeRepository.save(store);

    await this.auditLogsService.logAction(
      actorUserId,
      store.organizationId,
      saved.id,
      'STORE_UPDATED',
      'stores',
      saved.id,
      { updatedFields: Object.keys(dto) },
    );

    return saved;
  }

  async remove(
    id: string,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<{ message: string }> {
    const store = await this.findOne(id, tenantContext, isSuperAdmin);

    // Soft delete
    await this.storeRepository.softDelete(id);

    await this.auditLogsService.logAction(
      actorUserId,
      store.organizationId,
      store.id,
      'STORE_DELETED',
      'stores',
      store.id,
    );

    return { message: `Store ${store.name} soft deleted successfully` };
  }
}
