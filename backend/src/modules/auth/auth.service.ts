import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Session } from '../users/entities/session.entity';
import { UserCompany } from '../users/entities/user-company.entity';
import { Company } from '../settings/entities/company.entity';
import { Branch } from '../settings/entities/branch.entity';
import { AccessTokenPayload } from './strategies/jwt.strategy';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string;
    email: string | null;
    fullName: string;
    companyId: string | null;
    branchId: string | null;
    permissions: string[];
    isSystemRole: boolean;
    allCompanies: boolean;
    companyIds: string[];
    /** Every role name this user holds (e.g. ['Manager'], ['مدير فرع']) — permission codes alone
     * can't distinguish "Manager" from "مدير فرع" since both hold overlapping (additive)
     * permissions; a handful of UI restrictions need the literal role name instead (see
     * frontend/src/lib/use-active-company.ts's useIsPressManagerRestricted). */
    roleNames: string[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(UserCompany) private readonly userCompanyRepo: Repository<UserCompany>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private extractPermissions(user: User): string[] {
    const codes = new Set<string>();
    for (const role of user.roles ?? []) {
      for (const permission of role.permissions ?? []) {
        codes.add(`${permission.module}.${permission.action}`);
      }
    }
    return Array.from(codes);
  }

  /**
   * A true Administrator (isSystemRole) has implicit access to every company — no ACL rows are
   * ever checked or needed for that account. Everyone else is limited to whatever UserCompany rows
   * exist for them, which the Users & Roles admin flow manages (see UsersService).
   */
  private async extractCompanyIds(user: User): Promise<{ allCompanies: boolean; companyIds: string[] }> {
    const isSystemRole = user.roles?.some((role) => role.isSystemRole) ?? false;
    if (isSystemRole) return { allCompanies: true, companyIds: [] };
    const links = await this.userCompanyRepo.find({ where: { userId: user.id } });
    return { allCompanies: false, companyIds: links.map((l) => l.companyId) };
  }

  /** Resolves the main (or first) branch for a company — same fallback switchCompany() uses. */
  private async resolveBranchId(companyId: string): Promise<string | null> {
    const mainBranch = await this.branchRepo.findOne({ where: { companyId, isMainBranch: true } });
    const fallbackBranch = mainBranch ? null : await this.branchRepo.findOne({ where: { companyId } });
    return (mainBranch ?? fallbackBranch)?.id ?? null;
  }

  private async issueTokens(user: User, meta: { ip?: string; userAgent?: string }) {
    const permissions = this.extractPermissions(user);
    const isSystemRole = user.roles?.some((role) => role.isSystemRole) ?? false;
    const { allCompanies, companyIds } = await this.extractCompanyIds(user);

    // A non-admin's active companyId must always be one they actually hold a UserCompany ACL row
    // for — closes the gap where an admin unassigns a user's only company (or one that was never
    // set) but the stale/blank id would otherwise still be trusted and baked into the new token.
    if (!allCompanies) {
      if (!companyIds.length) {
        throw new ForbiddenException(
          'This account is not assigned to any company. Contact your administrator.',
        );
      }
      if (!user.companyId || !companyIds.includes(user.companyId)) {
        user.companyId = companyIds[0];
        user.branchId = await this.resolveBranchId(user.companyId);
        await this.userRepo.save(user);
      }
    }

    const payload: AccessTokenPayload = {
      sub: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      companyId: user.companyId,
      branchId: user.branchId,
      permissions,
      isSystemRole,
      allCompanies,
      companyIds,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      },
    );

    const refreshExpiresInMs = this.parseExpiryMs(
      this.configService.get<string>('jwt.refreshExpiresIn')!,
    );

    const session = this.sessionRepo.create({
      userId: user.id,
      refreshTokenHash: await argon2.hash(refreshToken),
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + refreshExpiresInMs),
    });
    await this.sessionRepo.save(session);

    return { accessToken, refreshToken, permissions, isSystemRole, allCompanies, companyIds };
  }

  private parseExpiryMs(expr: string): number {
    const match = /^(\d+)([smhd])$/.exec(expr);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const unitMs = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]!;
    return value * unitMs;
  }

  private toLoginResult(
    user: User,
    tokens: { accessToken: string; refreshToken: string; permissions: string[]; isSystemRole: boolean; allCompanies: boolean; companyIds: string[] },
  ): LoginResult {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        fullName: user.fullName,
        companyId: user.companyId,
        branchId: user.branchId,
        permissions: tokens.permissions,
        isSystemRole: tokens.isSystemRole,
        allCompanies: tokens.allCompanies,
        companyIds: tokens.companyIds,
        roleNames: user.roles?.map((role) => role.name) ?? [],
      },
    };
  }

  async login(
    phone: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    // Trimmed the same way phone/password are trimmed everywhere they're written (create/update/
    // changePassword below) — an accidental leading/trailing space typed or pasted into either
    // field must never be the difference between a matching and a non-matching login.
    const trimmedPhone = phone.trim();
    const trimmedPassword = password.trim();

    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.phone = :phone', { phone: trimmedPhone })
      .getOne();

    // Diagnostic only — logs the trimmed phone and two booleans (was a user found, did the
    // password match), never the password or its hash, so this is safe to leave in as a
    // permanent audit trail of login attempts, not just a temporary debugging aid.
    console.log(`[login] phone="${trimmedPhone}" userFound=${!!user}`);

    if (!user) throw new UnauthorizedException('Invalid phone number or password');

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException('Account temporarily locked due to failed login attempts');
    }

    if (!user.isActive) throw new ForbiddenException('Account is inactive');

    const valid = await argon2.verify(user.passwordHash, trimmedPassword);
    console.log(`[login] phone="${trimmedPhone}" passwordValid=${valid}`);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }
      await this.userRepo.save(user);
      throw new UnauthorizedException('Invalid phone number or password');
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null as unknown as Date;
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const updatedUser = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.id = :id', { id: user.id })
      .getOne();

    if (!updatedUser) throw new UnauthorizedException('User not found');

    const tokens = await this.issueTokens(updatedUser, meta);
    return this.toLoginResult(updatedUser, tokens);
  }

  async refresh(
    refreshToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const sessions = await this.sessionRepo.find({
      where: { userId: payload.sub, revoked: false },
    });

    let matchedSession: Session | null = null;
    for (const session of sessions) {
      if (session.expiresAt.getTime() < Date.now()) continue;
      if (await argon2.verify(session.refreshTokenHash, refreshToken)) {
        matchedSession = session;
        break;
      }
    }

    if (!matchedSession) throw new UnauthorizedException('Session not found or revoked');

    matchedSession.revoked = true;
    await this.sessionRepo.save(matchedSession);

    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.id = :id', { id: payload.sub })
      .getOne();

    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

    const tokens = await this.issueTokens(user, meta);
    return this.toLoginResult(user, tokens);
  }

  /**
   * Switches the caller's active company in place — re-issues tokens (same as a fresh login)
   * without requiring one, so the frontend's header switcher never needs to log out. Rejects any
   * target the caller isn't a true Administrator for and doesn't hold a UserCompany ACL row for,
   * regardless of what the client claims — this is the actual security boundary, not the UI that
   * only shows an allowed subset in the first place.
   */
  async switchCompany(
    userId: string,
    targetCompanyId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.permissions'],
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

    const targetCompany = await this.companyRepo.findOne({ where: { id: targetCompanyId } });
    if (!targetCompany) throw new NotFoundException('Company not found');

    const isSystemRole = user.roles?.some((role) => role.isSystemRole) ?? false;
    if (!isSystemRole) {
      const allowed = await this.userCompanyRepo.findOne({
        where: { userId, companyId: targetCompanyId },
      });
      if (!allowed) throw new ForbiddenException('You do not have access to this company');
    }

    user.companyId = targetCompanyId;
    user.branchId = await this.resolveBranchId(targetCompanyId);
    await this.userRepo.save(user);

    const updatedUser = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!updatedUser) throw new UnauthorizedException('User not found');

    const tokens = await this.issueTokens(updatedUser, meta);
    return this.toLoginResult(updatedUser, tokens);
  }

  /** The companies the caller may pick from in the company picker/switcher — all of them for a true Administrator, otherwise just their UserCompany ACL. */
  async getAccessibleCompanies(userId: string): Promise<Company[]> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['roles'] });
    if (!user) throw new UnauthorizedException('User not found');

    const isSystemRole = user.roles?.some((role) => role.isSystemRole) ?? false;
    if (isSystemRole) {
      return this.companyRepo.find({ where: { isActive: true }, order: { nameEn: 'ASC' } });
    }

    const links = await this.userCompanyRepo.find({ where: { userId } });
    if (!links.length) return [];
    return this.companyRepo.find({
      where: { id: In(links.map((l) => l.companyId)), isActive: true },
      order: { nameEn: 'ASC' },
    });
  }

  async logout(userId: string): Promise<void> {
    await this.sessionRepo.update({ userId, revoked: false }, { revoked: true });
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await argon2.verify(user.passwordHash, oldPassword.trim());
    if (!valid) throw new UnauthorizedException('Old password is incorrect');

    // Trimmed the same way login() trims before verify — otherwise a password set here with an
    // accidental trailing space would hash literally, then never match the trimmed value login()
    // verifies against, silently locking the user out of the account they just "successfully" reset.
    user.passwordHash = await argon2.hash(newPassword.trim());
    await this.userRepo.save(user);
    await this.sessionRepo.update({ userId, revoked: false }, { revoked: true });
  }
}
