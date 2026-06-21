import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { User } from '../../users/entities/user.entity';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/constants/error-codes';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userPayload = request.user;

    if (!userPayload) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED,
        'User authentication context missing',
        401,
      );
    }

    // Fetch user with roles and permissions from database to ensure up-to-date roles/status
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userPayload.id },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        'Authenticated user not found in system',
        401,
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'User account is not active',
        403,
      );
    }

    // Check if user has SUPER_ADMIN role (which has all permissions)
    const roles = user.roles.map((r) => r.name);
    if (roles.includes('SUPER_ADMIN')) {
      return true;
    }

    // Flatten permissions of all user roles
    const userPermissions = new Set<string>();
    for (const role of user.roles) {
      for (const permission of role.permissions) {
        userPermissions.add(permission.name);
      }
    }

    // Check if the user has all the required permissions for the route
    const hasPermission = requiredPermissions.every((perm) =>
      userPermissions.has(perm),
    );

    if (!hasPermission) {
      throw new AppException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'You do not have the required permissions to access this resource',
        403,
        { requiredPermissions, userPermissions: Array.from(userPermissions) },
      );
    }

    return true;
  }
}
