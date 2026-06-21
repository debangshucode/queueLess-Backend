import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async logAction(
    userId: string | null,
    organizationId: string | null,
    storeId: string | null,
    action: string,
    entity: string,
    entityId: string | null,
    metadata?: any,
  ): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create({
      userId,
      organizationId,
      storeId,
      action,
      entity,
      entityId,
      metadata: metadata || null,
    });
    return this.auditLogRepository.save(auditLog);
  }
}
