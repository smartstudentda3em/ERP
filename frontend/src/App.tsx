import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { router } from './router';
import { AuthBootstrap } from './components/auth/RequireAuth';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { ToastProvider } from './components/ui/Toast';
import './i18n';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <AuthBootstrap>
            <RouterProvider router={router} />
          </AuthBootstrap>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
