import { Global, Module } from '@nestjs/common';
import { PermissionsResolver } from './permissions-resolver.service';

// Global: the app-wide PermissionsGuard, AuthService (token permissions) and the users module (the
// founder's permission editor) all share ONE resolver, so one cache and one invalidation.
@Global()
@Module({
  providers: [PermissionsResolver],
  exports: [PermissionsResolver],
})
export class PermissionsModule {}
