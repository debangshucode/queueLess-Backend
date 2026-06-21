import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionItem } from '../sessions/entities/session-item.entity';
import { TenantContext } from '../common/interceptors/tenant.interceptor';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

export interface EmployeePerformance {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  revenueInfluenced: number;
  itemsAdded: number;
  sessionsContributed: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(SessionItem)
    private readonly sessionItemRepository: Repository<SessionItem>,
  ) {}

  async getEmployeePerformance(
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<EmployeePerformance[]> {
    const organizationId = tenantContext.organizationId;
    if (!isSuperAdmin && !organizationId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization ID is required to fetch performance metrics',
        HttpStatus.BAD_REQUEST,
      );
    }

    const query = this.sessionItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.session', 'session')
      .innerJoin('item.addedByUser', 'user')
      .select('user.id', 'employeeId')
      .addSelect('user.name', 'employeeName')
      .addSelect('user.email', 'employeeEmail')
      .addSelect('SUM(item.quantity * item.unitPrice)', 'revenueInfluenced')
      .addSelect('SUM(item.quantity)', 'itemsAdded')
      .addSelect('COUNT(DISTINCT item.sessionId)', 'sessionsContributed');

    if (!isSuperAdmin) {
      query.where('session.organizationId = :organizationId', {
        organizationId,
      });
    }

    query.groupBy('user.id').addGroupBy('user.name').addGroupBy('user.email');

    interface RawPerformanceResult {
      employeeId: string;
      employeeName: string;
      employeeEmail: string;
      revenueInfluenced: string;
      itemsAdded: string;
      sessionsContributed: string;
    }

    const results = await query.getRawMany();

    return results.map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      employeeEmail: row.employeeEmail,
      revenueInfluenced: parseFloat(row.revenueInfluenced) || 0,
      itemsAdded: parseInt(row.itemsAdded, 10) || 0,
      sessionsContributed: parseInt(row.sessionsContributed, 10) || 0,
    }));
  }
}
