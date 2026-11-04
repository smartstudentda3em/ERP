import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { FounderGuard } from '../../common/guards/founder.guard';
import { PermissionsResolver } from '../../common/permissions/permissions-resolver.service';
import { AuditRecorder } from '../audit-log/audit-recorder.service';
import { auditStorage } from '../audit-log/audit-context';
import { Permission } from './entities/permission.entity';
import { User } from './entities/user.entity';
import { UserPermission } from './entities/user-permission.entity';

/** Never editable per user: the activity log is founder-only by design, and a factory reset is
 * additionally locked to the real Administrator role. They are kept out of the editor entirely. */
const LOCKED_MODULES = new Set(['security.audit-log', 'system']);

export class SetUserPermissionsDto {
  /** The full set of operations this user should end up able to do. */
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) permissionCodes: string[];
}

@Injectable()
export class UserPermissionsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(UserPermission) private readonly overrideRepo: Repository<UserPermission>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly resolver: PermissionsResolver,
    private readonly recorder: AuditRecorder,
  ) {}

  private async loadTarget(id: string) {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.isFounder')
      .leftJoinAndSelect('u.roles', 'role')
      .where('u.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  /** Everything the editor needs in one call: the catalog, what his roles give him, his overrides. */
  async get(userId: string) {
    const user = await this.loadTarget(userId);
    const [permissions, base, overrides, effective] = await Promise.all([
      this.permissionRepo.find({ order: { module: 'ASC', action: 'ASC' } }),
      this.resolver.roleCodes(userId),
      this.resolver.overrides(userId),
      this.resolver.effective(userId),
    ]);
    return {
      user: { id: user.id, fullName: user.fullName, roles: user.roles?.map((r) => r.name) ?? [], isFounder: user.isFounder },
      catalog: permissions
        .filter((p) => !LOCKED_MODULES.has(p.module))
        .map((p) => ({ module: p.module, action: p.action, code: `${p.module}.${p.action}` })),
      roleCodes: base,
      overrides,
      effective,
    };
  }

  async set(actor: AuthenticatedUser, userId: string, desiredCodes: string[]) {
    const user = await this.loadTarget(userId);
    if (user.isFounder) {
      throw new BadRequestException('صاحب النظام يملك كل الصلاحيات تلقائياً ولا يمكن تقييده');
    }
    const permissions = await this.permissionRepo.find();
    const editable = permissions.filter((p) => !LOCKED_MODULES.has(p.module));
    const byCode = new Map(editable.map((p) => [`${p.module}.${p.action}`, p]));
    const unknown = desiredCodes.filter((c) => !byCode.has(c) && !LOCKED_MODULES.has(c.split('.').slice(0, -1).join('.')));
    if (unknown.length) throw new BadRequestException(`صلاحيات غير معروفة: ${unknown.slice(0, 5).join('، ')}`);

    const desired = new Set(desiredCodes.filter((c) => byCode.has(c)));
    const base = new Set(await this.resolver.roleCodes(userId));
    const before = await this.resolver.effective(userId);

    const rows: { permissionId: string; effect: 'GRANT' | 'DENY' }[] = [];
    for (const [code, p] of byCode) {
      const inBase = base.has(code);
      const inDesired = desired.has(code);
      if (inDesired && !inBase) rows.push({ permissionId: p.id, effect: 'GRANT' });
      if (!inDesired && inBase) rows.push({ permissionId: p.id, effect: 'DENY' });
    }

    await this.dataSource.transaction(async (manager) => {
      // Hard delete: only the current set of exceptions matters (the audit log keeps the history).
      await manager.query(`DELETE FROM user_permissions WHERE "userId" = $1`, [userId]);
      if (rows.length) {
        await manager.insert(
          UserPermission,
          rows.map((r) => ({ userId, permissionId: r.permissionId, effect: r.effect, updatedById: actor.userId })),
        );
      }
    });
    this.resolver.invalidate(userId);

    const after = await this.resolver.effective(userId);
    const added = after.filter((c) => !before.includes(c));
    const removed = before.filter((c) => !after.includes(c));
    const actorSnap = await this.recorder.snapshot(auditStorage.getStore());
    await this.recorder.insert([
      {
        companyId: actor.companyId ?? null,
        userId: actor.userId,
        userEmail: actor.email,
        userName: actor.fullName,
        userRole: actorSnap.userRole,
        departmentName: await this.recorder.companyName(actor.companyId),
        method: 'PUT',
        path: `/api/users/${userId}/permissions`,
        module: 'users.permissions',
        action: 'UPDATE',
        actionType: 'UPDATE',
        source: 'CHANGE',
        targetModel: 'user_permissions',
        targetLabel: 'صلاحيات مستخدم',
        entityId: userId,
        oldValues: { removedFromBefore: removed },
        newValues: { granted: added },
        description: `تعديل صلاحيات المستخدم ${user.fullName}: منح ${added.length} وسحب ${removed.length}`,
        requestBody: null,
        statusCode: 200,
        ipAddress: actorSnap.ipAddress,
        userAgent: actorSnap.userAgent,
        durationMs: null,
      },
    ]);

    return this.get(userId);
  }
}

/**
 * Founder-only. FounderGuard (not a permission) on purpose: no role — not even another Administrator —
 * can be granted the power to hand out permissions.
 */
@ApiTags('Users')
@Controller('users')
@UseGuards(FounderGuard)
export class UserPermissionsController {
  constructor(private readonly service: UserPermissionsService) {}

  @Get(':id/permissions')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Put(':id/permissions')
  set(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetUserPermissionsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.set(actor, id, dto.permissionCodes);
  }
}
