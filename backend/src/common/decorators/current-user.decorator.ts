import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
  phone: string;
  email: string | null;
  fullName: string;
  /** The user's currently ACTIVE company — not necessarily their only one. Changes in place (new tokens re-issued) via POST /auth/switch-company, without a fresh login. */
  companyId: string | null;
  branchId: string | null;
  permissions: string[];
  /** True only for the real, unmodifiable Administrator/Super-Admin role (Role.isSystemRole) — cached at login/refresh time, same as `permissions`. UI-nicety signal only; anything security-sensitive re-checks this fresh against the DB server-side rather than trusting the token. */
  isSystemRole: boolean;
  /** True for a true Administrator — implicit access to every company, `companyIds` is empty and irrelevant for them. */
  allCompanies: boolean;
  /** The full set of companies this user may access/switch into (ignored when allCompanies is true). */
  companyIds: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    return data ? user?.[data] : user;
  },
);
