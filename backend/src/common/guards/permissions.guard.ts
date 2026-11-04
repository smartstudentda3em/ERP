import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PermissionsResolver } from '../permissions/permissions-resolver.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private resolver: PermissionsResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    // Always replace the token's (possibly stale) permission list with the live one — also what any
    // service reading request.user.permissions later in this request will see. The founder resolves
    // to every permission, so he is never refused.
    if (user?.userId) {
      user.permissions = await this.resolver.effective(user.userId);
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    if (!user) throw new ForbiddenException('Not authenticated');

    const has = required.every((perm) => user.permissions?.includes(perm));
    if (!has) {
      throw new ForbiddenException('غير مسموح لك بهذا الإجراء');
    }
    return true;
  }
}
