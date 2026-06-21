import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    dto: CreateOrganizationDto,
    actorUserId: string | null,
  ): Promise<Organization> {
    const existing = await this.organizationRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization email already exists',
        HttpStatus.BAD_REQUEST,
      );
    }

    const org = this.organizationRepository.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      subscriptionPlan: dto.subscriptionPlan || 'FREE',
      status: 'ACTIVE',
    });

    const saved = await this.organizationRepository.save(org);

    await this.auditLogsService.logAction(
      actorUserId,
      saved.id,
      null,
      'ORGANIZATION_CREATED',
      'organizations',
      saved.id,
      { dto },
    );

    return saved;
  }

  async findOne(id: string): Promise<Organization> {
    const org = await this.organizationRepository.findOne({
      where: { id },
      relations: ['stores'],
    });
    if (!org) {
      throw new AppException(
        ErrorCode.ORGANIZATION_NOT_FOUND,
        'Organization not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return org;
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    actorUserId: string | null,
  ): Promise<Organization> {
    const org = await this.findOne(id);

    Object.assign(org, dto);
    const saved = await this.organizationRepository.save(org);

    await this.auditLogsService.logAction(
      actorUserId,
      saved.id,
      null,
      'ORGANIZATION_UPDATED',
      'organizations',
      saved.id,
      { updatedFields: Object.keys(dto) },
    );

    return saved;
  }
}
