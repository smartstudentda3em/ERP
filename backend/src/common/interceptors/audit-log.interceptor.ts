import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditActionType, AuditLog } from '../../modules/audit-log/entities/audit-log.entity';
import { AuditContext, auditStorage } from '../../modules/audit-log/audit-context';
import { AuditRecorder } from '../../modules/audit-log/audit-recorder.service';
import { routeLabel } from '../../modules/audit-log/audit-labels';

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
// Pure noise (silent token refresh) or recorded by their own dedicated endpoint.
const SKIPPED_PATHS = [/\/auth\/refresh/, /\/auth\/switch-company/, /\/audit-events/];

/**
 * Request-level trail. Business-record changes are captured with old/new values by AuditSubscriber;
 * this adds a row only when that didn't happen — login/logout, a refused or failed attempt (e.g. a
 * write into a closed month), or an action that never touched the ORM — so every mutating call
 * leaves some trace.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly recorder: AuditRecorder) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const start = Date.now();

    if (!MUTATING_METHODS.includes(request.method)) {
      return next.handle();
    }
    const ctx = auditStorage.getStore();

    return next.handle().pipe(
      tap({
        next: (body) => void this.write(request, ctx, 200, start, body),
        error: (err) => void this.write(request, ctx, err?.status || 500, start, null),
      }),
    );
  }

  private inferAction(method: string, path: string): AuditActionType {
    if (/\/auth\/login/.test(path)) return 'LOGIN';
    if (/\/auth\/logout/.test(path)) return 'LOGOUT';
    if (/\/(approve|confirm|post|finalize)(\/|\?|$)/.test(path)) return 'APPROVE';
    if (method === 'DELETE') return 'DELETE';
    if (method === 'POST') return 'CREATE';
    return 'UPDATE';
  }

  private async write(request: any, ctx: AuditContext | undefined, statusCode: number, start: number, body: any) {
    try {
      const path: string = request.originalUrl || request.url || '';
      if (SKIPPED_PATHS.some((re) => re.test(path))) return;
      const failed = statusCode >= 400;
      const actionType = this.inferAction(request.method, path);
      const alwaysLog = actionType === 'LOGIN' || actionType === 'LOGOUT';
      if (!failed && !alwaysLog && ctx && ctx.changeCount > 0) return; // the CHANGE rows already tell the story

      // A successful login has no request.user yet — the response carries who just signed in.
      const loggedIn = actionType === 'LOGIN' && !failed ? (body?.data?.user ?? body?.user) : null;
      const actor = await this.recorder.snapshot(
        ctx,
        loggedIn ? { id: loggedIn.id, fullName: loggedIn.fullName, email: loggedIn.email, companyId: loggedIn.companyId } : undefined,
      );

      const label = routeLabel(path);
      const verb =
        actionType === 'LOGIN' ? (failed ? 'محاولة تسجيل دخول فاشلة' : 'تسجيل دخول')
        : actionType === 'LOGOUT' ? 'تسجيل خروج'
        : actionType === 'DELETE' ? 'حذف'
        : actionType === 'APPROVE' ? 'اعتماد'
        : actionType === 'CREATE' ? 'إنشاء'
        : 'تعديل';
      const target = actionType === 'LOGIN' || actionType === 'LOGOUT' ? '' : ` ${label ?? path.split('?')[0]}`;
      const phone = actionType === 'LOGIN' && failed ? ` (الهاتف ${request.body?.phone ?? '—'})` : '';
      const description = `${verb}${target}${phone}${failed && actionType !== 'LOGIN' ? ` — فشلت العملية (${statusCode})` : ''}`;

      const row: Partial<AuditLog> = {
        companyId: actor.companyId ?? null,
        userId: actor.userId,
        userEmail: actor.userEmail,
        userName: actor.userName,
        userRole: actor.userRole,
        departmentName: await this.recorder.companyName(actor.companyId),
        method: request.method,
        path: path.slice(0, 300),
        module: this.extractModule(path),
        action: actionType,
        actionType,
        source: 'REQUEST',
        targetModel: null,
        targetLabel: label,
        entityId: this.extractRecordId(request),
        oldValues: null,
        newValues: null,
        description,
        requestBody: this.sanitize(request.body),
        statusCode,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        durationMs: Date.now() - start,
      };
      await this.recorder.insert([row]);
    } catch {
      // never let auditing affect the request
    }
  }

  private extractRecordId(request: any): string | null {
    const id = request.params?.id;
    return typeof id === 'string' ? id.slice(0, 64) : null;
  }

  private extractModule(url: string): string {
    const parts = url.split('?')[0].split('/').filter(Boolean);
    return parts.slice(0, 2).join('.');
  }

  private sanitize(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== 'object') return null;
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const key of ['password', 'newPassword', 'oldPassword', 'passwordHash', 'refreshToken']) {
      if (key in clone) clone[key] = '***';
    }
    return clone;
  }
}
