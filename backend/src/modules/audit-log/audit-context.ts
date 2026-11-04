import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context the ORM-level audit subscriber reads to learn WHO did a change and from
 * where. It holds the live Express request (request.user is only attached later by the auth guard,
 * so it must be read lazily at the moment a change happens, never copied up front).
 */
export interface AuditContext {
  request: any;
  /** How many CHANGE rows this request produced — lets the interceptor skip a redundant REQUEST row. */
  changeCount: number;
}

export const auditStorage = new AsyncLocalStorage<AuditContext>();

@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    auditStorage.run({ request: req, changeCount: 0 }, next);
  }
}
