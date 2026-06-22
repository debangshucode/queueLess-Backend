import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvoicesService } from './invoices.service';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { Session } from '../sessions/entities/session.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { TenantContext } from '../common/interceptors/tenant.interceptor';
import { AppException } from '../common/exceptions/app.exception';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let invoiceRepo: any;
  let auditLogsService: any;

  const mockTenantContext: TenantContext = {
    organizationId: 'org-123',
    storeId: 'store-123',
  };

  beforeEach(async () => {
    invoiceRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    auditLogsService = {
      logAction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: getRepositoryToken(Invoice),
          useValue: invoiceRepo,
        },
        {
          provide: getRepositoryToken(InvoiceItem),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Session),
          useValue: {},
        },
        {
          provide: AuditLogsService,
          useValue: auditLogsService,
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyStatus', () => {
    it('should map PENDING to UNPAID and return formatted status', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        organizationId: 'org-123',
        status: InvoiceStatus.PENDING,
        invoiceNumber: 'INV-123',
        subtotal: 100,
        taxAmount: 10,
        discountAmount: 5,
        totalAmount: 105,
        createdAt: new Date(),
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            productName: 'Blue Shirt',
            sku: 'BS-123',
            barcode: '123456',
            unitPrice: 100,
            quantity: 1,
            totalAmount: 100,
          },
        ],
      };

      invoiceRepo.findOne.mockResolvedValue(mockInvoice);

      const result = await service.verifyStatus('invoice-1', mockTenantContext, false);

      expect(result.status).toBe('UNPAID');
      expect(result.invoiceNumber).toBe('INV-123');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productName).toBe('Blue Shirt');
    });

    it('should return PAID status directly if paid', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        organizationId: 'org-123',
        status: InvoiceStatus.PAID,
        invoiceNumber: 'INV-123',
        subtotal: 100,
        taxAmount: 10,
        discountAmount: 5,
        totalAmount: 105,
        createdAt: new Date(),
        items: [],
      };

      invoiceRepo.findOne.mockResolvedValue(mockInvoice);

      const result = await service.verifyStatus('invoice-1', mockTenantContext, false);

      expect(result.status).toBe('PAID');
    });
  });

  describe('verify', () => {
    it('should verify a PAID invoice and transition status to VERIFIED', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        organizationId: 'org-123',
        status: InvoiceStatus.PAID,
        invoiceNumber: 'INV-123',
        subtotal: 100,
        taxAmount: 10,
        discountAmount: 5,
        totalAmount: 105,
        createdAt: new Date(),
        items: [],
      };

      invoiceRepo.findOne.mockResolvedValue(mockInvoice);
      invoiceRepo.save.mockImplementation((x: any) => Promise.resolve(x));

      const result = await service.verify('invoice-1', mockTenantContext, 'user-1', false);

      expect(mockInvoice.status).toBe(InvoiceStatus.VERIFIED);
      expect(result.status).toBe('VERIFIED');
      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        'user-1',
        'org-123',
        'store-123',
        'INVOICE_VERIFIED',
        'invoices',
        'invoice-1',
        expect.any(Object),
      );
    });

    it('should throw an error when trying to verify a PENDING invoice', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        organizationId: 'org-123',
        status: InvoiceStatus.PENDING,
        invoiceNumber: 'INV-123',
        subtotal: 100,
        taxAmount: 10,
        discountAmount: 5,
        totalAmount: 105,
        createdAt: new Date(),
        items: [],
      };

      invoiceRepo.findOne.mockResolvedValue(mockInvoice);

      await expect(
        service.verify('invoice-1', mockTenantContext, 'user-1', false),
      ).rejects.toThrow(AppException);
    });
  });
});
