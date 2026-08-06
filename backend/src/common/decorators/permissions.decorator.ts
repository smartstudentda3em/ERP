import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Marks an endpoint as requiring one or more permission codes, e.g. 'sales.invoice.create'.
 * Checked by PermissionsGuard against the authenticated user's role permissions.
 */
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
