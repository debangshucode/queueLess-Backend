import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../constants/error-codes';

export class TenantContext {
  organizationId: string | null;
  storeId: string | null;
}

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return next.handle(); // Let AuthGuard reject it if it's not authenticated
    }

    const organizationId = user.organizationId;
    const storeId = user.storeId;
    const role = user.role;

    // Attach Tenant Context to request for controllers and services
    request.tenant = {
      organizationId,
      storeId,
    };

    // Strict validation: Non-Super-Admins cannot query/manipulate other tenants
    if (role !== 'SUPER_ADMIN') {
      // 1. Check body
      if (request.body) {
        if (
          request.body.organizationId &&
          request.body.organizationId !== organizationId
        ) {
          throw new AppException(
            ErrorCode.TENANT_MISMATCH,
            'Operation forbidden: Organization ID mismatch',
            403,
          );
        }
        // Force the user's tenant organizationId onto the body
        request.body.organizationId = organizationId;
      }

      // 2. Check query params
      if (request.query) {
        if (
          request.query.organizationId &&
          request.query.organizationId !== organizationId
        ) {
          throw new AppException(
            ErrorCode.TENANT_MISMATCH,
            'Query forbidden: Organization ID mismatch',
            403,
          );
        }
        // Force the user's tenant organizationId onto query
        request.query.organizationId = organizationId;
      }
    }

    return next.handle();
  }
}
