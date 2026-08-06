import { useAuthStore } from '../../store/auth-store';

/**
 * Only a true System Administrator may freely assign a sales representative/owner to a
 * transaction — everyone else is locked to their own identity, and the choice is re-enforced
 * server-side regardless of what this hook computes (see SalesRepAccessService on the backend).
 * This hook only drives the disabled/pre-filled state of the dropdown itself.
 */
export function useSalesRepLock<T extends { id: string; userId?: string | null }>(reps: T[] | undefined) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.isSystemRole ?? false;
  const ownRep = !isAdmin ? (reps ?? []).find((r) => r.userId === user?.id) : undefined;
  return { isAdmin, ownRep, currentUserId: user?.id ?? '', currentUserName: user?.fullName ?? '' };
}
