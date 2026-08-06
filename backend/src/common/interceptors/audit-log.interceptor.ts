import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Repository } from 'typeorm';
import { AuditLog } from '../../modules/audit-log/entities/audit-log.entity';

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(AuditLog) private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const start = Date.now();

    if (!MUTATING_METHODS.includes(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => this.write(request, 200, start),
        error: (err) => this.write(request, err?.status || 500, start),
      }),
    );
  }

  private write(request: any, statusCode: number, start: number) {
    const user = request.user;
    const auditEntry = this.auditLogRepo.create({
      companyId: user?.companyId ?? null,
      userId: user?.userId ?? null,
      userEmail: user?.email ?? null,
      method: request.method,
      path: request.originalUrl || request.url,
      module: this.extractModule(request.url),
      action: request.method,
      requestBody: this.sanitize(request.body),
      statusCode,
      ipAddress: request.ip,
      userAgent: request.headers?.['user-agent'],
      durationMs: Date.now() - start,
    });
    this.auditLogRepo.save(auditEntry).catch(() => undefined);
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
