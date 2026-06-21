import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  userId: string;
  organizationId: string | null;
  storeId: string | null;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ||
        'super-secret-access-key-change-in-production',
    });
  }

  validate(payload: JwtPayload) {
    // This attaches the returned object to the Request object as request.user
    return {
      id: payload.userId,
      organizationId: payload.organizationId,
      storeId: payload.storeId,
      role: payload.role,
    };
  }
}
