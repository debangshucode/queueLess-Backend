import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { Permission } from '../auth/entities/permission.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { TenantContext } from '../common/interceptors/tenant.interceptor';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    dto: CreateUserDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<User> {
    const organizationId = tenantContext.organizationId;
    if (isSuperAdmin && dto.storeId) {
      // Super admin can specify storeId and derive organization or organization is supplied.
    }

    if (!organizationId && !isSuperAdmin) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Organization ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check if user already exists
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.USER_ALREADY_EXISTS,
        'Email already registered',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Fetch the role
    const role = await this.roleRepository.findOne({
      where: { name: dto.roleName },
    });
    if (!role) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        `Role ${dto.roleName} not found`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.roleName === 'SUPER_ADMIN' && !isSuperAdmin) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'Cannot assign SUPER_ADMIN role',
        HttpStatus.FORBIDDEN,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      passwordHash,
      organizationId,
      storeId: dto.storeId || null,
      status: 'ACTIVE',
      roles: [role],
    });

    const saved = await this.userRepository.save(user);

    await this.auditLogsService.logAction(
      actorUserId,
      organizationId,
      dto.storeId || null,
      'USER_CREATED',
      'users',
      saved.id,
      { email: dto.email, role: dto.roleName },
    );

    return saved;
  }

  async findAll(
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<User[]> {
    if (isSuperAdmin) {
      return this.userRepository.find({ relations: ['roles'] });
    }

    return this.userRepository.find({
      where: { organizationId: tenantContext.organizationId || undefined },
      relations: ['roles'],
    });
  }

  async findOne(
    id: string,
    tenantContext: TenantContext,
    isSuperAdmin: boolean,
  ): Promise<User> {
    const whereClause: FindOptionsWhere<User> = { id };
    if (!isSuperAdmin) {
      whereClause.organizationId = tenantContext.organizationId || undefined;
    }

    const user = await this.userRepository.findOne({
      where: whereClause,
      relations: ['roles'],
    });

    if (!user) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        'User not found or access denied',
        HttpStatus.NOT_FOUND,
      );
    }

    return user;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<User> {
    const user = await this.findOne(id, tenantContext, isSuperAdmin);

    if (dto.name) user.name = dto.name;
    if (dto.phone) user.phone = dto.phone;
    if (dto.storeId) user.storeId = dto.storeId;

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.roleName) {
      if (dto.roleName === 'SUPER_ADMIN' && !isSuperAdmin) {
        throw new AppException(
          ErrorCode.FORBIDDEN_RESOURCE,
          'Cannot assign SUPER_ADMIN role',
          HttpStatus.FORBIDDEN,
        );
      }
      const role = await this.roleRepository.findOne({
        where: { name: dto.roleName },
      });
      if (!role) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          `Role ${dto.roleName} not found`,
          HttpStatus.BAD_REQUEST,
        );
      }
      user.roles = [role];
    }

    const saved = await this.userRepository.save(user);

    await this.auditLogsService.logAction(
      actorUserId,
      user.organizationId,
      user.storeId,
      'USER_UPDATED',
      'users',
      saved.id,
      { updatedFields: Object.keys(dto) },
    );

    return saved;
  }

  async deactivate(
    id: string,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<User> {
    const user = await this.findOne(id, tenantContext, isSuperAdmin);

    if (user.id === actorUserId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Cannot deactivate your own account',
        HttpStatus.BAD_REQUEST,
      );
    }

    user.status = 'INACTIVE';
    const saved = await this.userRepository.save(user);

    await this.auditLogsService.logAction(
      actorUserId,
      user.organizationId,
      user.storeId,
      'USER_DEACTIVATED',
      'users',
      saved.id,
    );

    return saved;
  }

  async updateStatus(
    id: string,
    status: string,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<User> {
    const user = await this.findOne(id, tenantContext, isSuperAdmin);

    if (user.id === actorUserId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Cannot modify your own status',
        HttpStatus.BAD_REQUEST,
      );
    }

    user.status = status;
    const saved = await this.userRepository.save(user);

    await this.auditLogsService.logAction(
      actorUserId,
      user.organizationId,
      user.storeId,
      'USER_STATUS_UPDATED',
      'users',
      saved.id,
      { status },
    );

    return saved;
  }

  async remove(
    id: string,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<{ message: string }> {
    const user = await this.findOne(id, tenantContext, isSuperAdmin);

    if (user.id === actorUserId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Cannot delete your own account',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.userRepository.remove(user);

    await this.auditLogsService.logAction(
      actorUserId,
      user.organizationId,
      user.storeId,
      'USER_DELETED',
      'users',
      id,
    );

    return { message: 'User deleted successfully' };
  }

  async assignRole(
    id: string,
    roleName: string,
    tenantContext: TenantContext,
    actorUserId: string,
    isSuperAdmin: boolean,
  ): Promise<User> {
    const user = await this.findOne(id, tenantContext, isSuperAdmin);

    if (roleName === 'SUPER_ADMIN' && !isSuperAdmin) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'Cannot assign SUPER_ADMIN role',
        HttpStatus.FORBIDDEN,
      );
    }

    const role = await this.roleRepository.findOne({
      where: { name: roleName },
    });
    if (!role) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        `Role ${roleName} not found`,
        HttpStatus.BAD_REQUEST,
      );
    }

    user.roles = [role];
    const saved = await this.userRepository.save(user);

    await this.auditLogsService.logAction(
      actorUserId,
      user.organizationId,
      user.storeId,
      'USER_ROLE_ASSIGNED',
      'users',
      saved.id,
      { newRole: roleName },
    );

    return saved;
  }

  async getRolesSuggestions(isSuperAdmin: boolean): Promise<Role[]> {
    if (isSuperAdmin) {
      return this.roleRepository.find();
    }
    // Filter out SUPER_ADMIN role for organization owners and others
    return this.roleRepository
      .createQueryBuilder('role')
      .where('role.name != :name', { name: 'SUPER_ADMIN' })
      .getMany();
  }

  async createRole(dto: CreateRoleDto, actorUserId: string): Promise<Role> {
    const existing = await this.roleRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        `Role ${dto.name} already exists`,
        HttpStatus.BAD_REQUEST,
      );
    }

    let permissions: Permission[] = [];
    if (dto.permissionNames && dto.permissionNames.length > 0) {
      permissions = await this.permissionRepository.find({
        where: { name: In(dto.permissionNames) },
      });
    }

    const role = this.roleRepository.create({
      name: dto.name,
      description: dto.description,
      permissions,
    });

    const saved = await this.roleRepository.save(role);

    await this.auditLogsService.logAction(
      actorUserId,
      null,
      null,
      'ROLE_CREATED',
      'roles',
      saved.id,
      { dto },
    );

    return saved;
  }

  async createPermission(
    dto: CreatePermissionDto,
    actorUserId: string,
  ): Promise<Permission> {
    const existing = await this.permissionRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        `Permission ${dto.name} already exists`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const perm = this.permissionRepository.create({
      name: dto.name,
      description: dto.description,
    });

    const saved = await this.permissionRepository.save(perm);

    await this.auditLogsService.logAction(
      actorUserId,
      null,
      null,
      'PERMISSION_CREATED',
      'permissions',
      saved.id,
      { dto },
    );

    return saved;
  }
}
