import { useAuthStore } from '../../store/auth-store';

/**
 * A true System Administrator, or the seeded "Manager" role, may freely assign a sales
 * representative/owner to a transaction — everyone else is locked to their own identity, and the
 * choice is re-enforced server-side regardless of what this hook computes (see
 * SalesRepAccessService.isSystemAdmin() on the backend, which treats the same two roles as
 * equivalent). This hook only drives the disabled/pre-filled state of the dropdown itself.
 */
export function useSalesRepLock<T extends { id: string; userId?: string | null }>(reps: T[] | undefined) {
  const user = useAuthStore((s) => s.user);
  const hasRole = useAuthStore((s) => s.hasRole);
  const isAdmin = (user?.isSystemRole || hasRole('Manager')) ?? false;
  const ownRep = !isAdmin ? (reps ?? []).find((r) => r.userId === user?.id) : undefined;
  return { isAdmin, ownRep, currentUserId: user?.id ?? '', currentUserName: user?.fullName ?? '' };
}
