import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { Session, SessionStatus } from '../sessions/entities/session.entity';
import { TenantContext } from '../common/interceptors/tenant.interceptor';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepository: Repository<InvoiceItem>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly auditLogsService: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateInvoiceDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<Invoice> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const session = await queryRunner.manager.findOne(Session, {
        where: { id: dto.sessionId },
        relations: ['items', 'items.product'],
      });

      if (!session) {
        throw new AppException(
          ErrorCode.NOT_FOUND,
          `Session with ID ${dto.sessionId} not found`,
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

      if (session.status !== SessionStatus.ACTIVE) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          `Session is already in status ${session.status}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!session.items || session.items.length === 0) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          'Cannot generate invoice for an empty cart session',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if invoice already exists for this session
      const existingInvoice = await queryRunner.manager.findOne(Invoice, {
        where: { sessionId: session.id },
      });
      if (existingInvoice) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          'An invoice has already been generated for this session',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Calculate amounts
      const subtotal = session.items.reduce((sum, item) => {
        return sum + Number(item.unitPrice) * item.quantity;
      }, 0);

      const discountAmount =
        dto.discountAmount !== undefined ? dto.discountAmount : null;
      const taxAmount = dto.taxAmount !== undefined ? dto.taxAmount : null;
      const totalAmount = subtotal - (discountAmount || 0) + (taxAmount || 0);

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Create Invoice
      const invoice = queryRunner.manager.create(Invoice, {
        organizationId: session.organizationId,
        sessionId: session.id,
        invoiceNumber,
        status: InvoiceStatus.PENDING,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount,
      });

      const savedInvoice = await queryRunner.manager.save(Invoice, invoice);

      // Create Invoice Items
      const invoiceItems = session.items.map((item) => {
        return queryRunner.manager.create(InvoiceItem, {
          invoiceId: savedInvoice.id,
          productId: item.productId,
          productName: item.product.name,
          sku: item.product.sku,
          barcode: item.product.barcode || null,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          taxAmount: taxAmount
            ? Number(
                (
                  ((Number(item.unitPrice) * item.quantity) / subtotal) *
                  taxAmount
                ).toFixed(2),
              )
            : null,
          totalAmount: Number(item.unitPrice) * item.quantity,
        });
      });

      await queryRunner.manager.save(InvoiceItem, invoiceItems);

      // Transition Session to CHECKED_OUT
      session.status = SessionStatus.CHECKED_OUT;
      await queryRunner.manager.save(Session, session);

      await queryRunner.commitTransaction();

      await this.auditLogsService.logAction(
        actorUserId,
        session.organizationId,
        tenantContext.storeId,
        'INVOICE_CREATED',
        'invoices',
        savedInvoice.id,
        { sessionId: session.id, totalAmount },
      );

      return this.findOne(savedInvoice.id, tenantContext, isSuperAdmin);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findOne(
    id: string,
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['items', 'session', 'payment'],
    });

    if (!invoice) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        `Invoice with ID ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      !isSuperAdmin &&
      invoice.organizationId !== tenantContext.organizationId
    ) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'You do not have access to this invoice',
        HttpStatus.FORBIDDEN,
      );
    }

    return invoice;
  }

  async findAll(
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<Invoice[]> {
    if (isSuperAdmin) {
      return this.invoiceRepository.find({
        relations: ['items', 'payment'],
      });
    }

    return this.invoiceRepository.find({
      where: { organizationId: tenantContext.organizationId || undefined },
      relations: ['items', 'payment'],
    });
  }
}
