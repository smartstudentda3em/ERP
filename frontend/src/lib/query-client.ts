import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // This app always serves reads from either a real backend or the local offline store — it
      // never actually depends on the browser's network connectivity, so pausing fetches when
      // `navigator.onLine` looks false (React Query's default) only stalls the app for no reason.
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
});
