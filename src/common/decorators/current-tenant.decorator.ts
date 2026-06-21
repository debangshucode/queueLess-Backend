import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '../interceptors/tenant.interceptor';

export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant || { organizationId: null, storeId: null };
  },
);
