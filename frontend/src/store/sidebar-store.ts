import { create } from 'zustand';

const STORAGE_KEY = 'erp_sidebar_pinned';

// Defaults to pinned (today's always-visible desktop behavior) so nobody's layout changes until
// they deliberately unpin it — mirrors theme-store.ts's own localStorage-on-module-init pattern.
const stored = localStorage.getItem(STORAGE_KEY);
const initialPinned = stored === null ? true : stored === 'true';

interface SidebarState {
  pinned: boolean;
  togglePinned: () => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  pinned: initialPinned,
  togglePinned: () => {
    const next = !get().pinned;
    localStorage.setItem(STORAGE_KEY, String(next));
    set({ pinned: next });
  },
}));
