import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

export interface AccessTokenPayload {
  sub: string;
  phone: string;
  email: string | null;
  fullName: string;
  companyId: string | null;
  branchId: string | null;
  permissions: string[];
  isSystemRole: boolean;
  allCompanies: boolean;
  companyIds: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      phone: payload.phone,
      email: payload.email,
      fullName: payload.fullName,
      companyId: payload.companyId,
      branchId: payload.branchId,
      permissions: payload.permissions,
      isSystemRole: payload.isSystemRole,
      allCompanies: payload.allCompanies,
      companyIds: payload.companyIds,
    };
  }
}
