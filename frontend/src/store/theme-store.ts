import { create } from 'zustand';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

const stored = (localStorage.getItem('erp_theme') as Theme | null) ?? 'light';
applyTheme(stored);

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: stored,
  toggleTheme: () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('erp_theme', next);
    applyTheme(next);
    set({ theme: next });
  },
}));
