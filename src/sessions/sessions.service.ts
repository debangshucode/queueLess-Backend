import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, SessionStatus } from './entities/session.entity';
import { SessionItem } from './entities/session-item.entity';
import { Product } from '../products/entities/product.entity';
import { TenantContext } from '../common/interceptors/tenant.interceptor';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AddSessionItemDto } from './dto/add-session-item.dto';
import { UpdateSessionItemDto } from './dto/update-session-item.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(SessionItem)
    private readonly sessionItemRepository: Repository<SessionItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    dto: CreateSessionDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
    orgIdOverride?: string,
  ): Promise<Session> {
    const organizationId =
      isSuperAdmin && orgIdOverride
        ? orgIdOverride
        : tenantContext.organizationId;
    if (!organizationId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization ID is required to create a session',
        HttpStatus.BAD_REQUEST,
      );
    }

    const session = this.sessionRepository.create({
      organizationId,
      status: SessionStatus.ACTIVE,
      customerId: dto.customerId || null,
    });

    const saved = await this.sessionRepository.save(session);

    await this.auditLogsService.logAction(
      actorUserId,
      organizationId,
      tenantContext.storeId,
      'SESSION_CREATED',
      'sessions',
      saved.id,
      { dto },
    );

    return saved;
  }

  async findOne(
    id: string,
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['items', 'items.product', 'items.addedByUser'],
    });

    if (!session) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Session with ID ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      !isSuperAdmin &&
      session.organizationId !== tenantContext.organizationId
    ) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'You do not have access to this session',
        HttpStatus.FORBIDDEN,
      );
    }

    return session;
  }

  async findAll(
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Session[]> {
    if (isSuperAdmin) {
      return this.sessionRepository.find({
        relations: ['items', 'items.product'],
      });
    }

    return this.sessionRepository.find({
      where: { organizationId: tenantContext.organizationId || undefined },
      relations: ['items', 'items.product'],
    });
  }

  async addItem(
    sessionId: string,
    dto: AddSessionItemDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<Session> {
    const session = await this.findOne(sessionId, tenantContext, isSuperAdmin);

    if (session.status !== SessionStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Cannot add items to a non-active session',
        HttpStatus.BAD_REQUEST,
      );
    }

    const product = await this.productRepository.findOne({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Product with ID ${dto.productId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      !isSuperAdmin &&
      product.organizationId !== tenantContext.organizationId
    ) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'You do not have access to this product',
        HttpStatus.FORBIDDEN,
      );
    }

    let item = await this.sessionItemRepository.findOne({
      where: { sessionId, productId: dto.productId },
    });

    if (item) {
      // Overwrite addedByUserId with the latest attendant and increment quantity
      item.quantity += dto.quantity;
      item.unitPrice = product.price;
      item.addedByUserId = actorUserId;
    } else {
      item = this.sessionItemRepository.create({
        sessionId,
        productId: dto.productId,
        quantity: dto.quantity,
        unitPrice: product.price,
        addedByUserId: actorUserId,
      });
    }

    await this.sessionItemRepository.save(item);

    await this.auditLogsService.logAction(
      actorUserId,
      session.organizationId,
      tenantContext.storeId,
      'SESSION_ITEM_ADDED',
      'session_items',
      item.id,
      { productId: dto.productId, quantity: dto.quantity },
    );

    return this.findOne(sessionId, tenantContext, isSuperAdmin);
  }

  async updateItem(
    sessionId: string,
    productId: string,
    dto: UpdateSessionItemDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<Session> {
    const session = await this.findOne(sessionId, tenantContext, isSuperAdmin);

    if (session.status !== SessionStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Cannot update items on a non-active session',
        HttpStatus.BAD_REQUEST,
      );
    }

    const item = await this.sessionItemRepository.findOne({
      where: { sessionId, productId },
    });

    if (!item) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Product with ID ${productId} is not in this session cart`,
        HttpStatus.NOT_FOUND,
      );
    }

    item.quantity = dto.quantity;
    item.addedByUserId = actorUserId;

    await this.sessionItemRepository.save(item);

    await this.auditLogsService.logAction(
      actorUserId,
      session.organizationId,
      tenantContext.storeId,
      'SESSION_ITEM_UPDATED',
      'session_items',
      item.id,
      { productId, quantity: dto.quantity },
    );

    return this.findOne(sessionId, tenantContext, isSuperAdmin);
  }

  async removeItem(
    sessionId: string,
    productId: string,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<Session> {
    const session = await this.findOne(sessionId, tenantContext, isSuperAdmin);

    if (session.status !== SessionStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Cannot remove items from a non-active session',
        HttpStatus.BAD_REQUEST,
      );
    }

    const item = await this.sessionItemRepository.findOne({
      where: { sessionId, productId },
    });

    if (!item) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Product with ID ${productId} is not in this session cart`,
        HttpStatus.NOT_FOUND,
      );
    }

    const itemId = item.id;
    await this.sessionItemRepository.remove(item);

    await this.auditLogsService.logAction(
      actorUserId,
      session.organizationId,
      tenantContext.storeId,
      'SESSION_ITEM_REMOVED',
      'session_items',
      itemId,
      { productId },
    );

    return this.findOne(sessionId, tenantContext, isSuperAdmin);
  }
}
