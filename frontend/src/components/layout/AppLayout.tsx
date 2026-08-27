import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Breadcrumbs } from './Breadcrumbs';
import { ScrollToTopButton } from './ScrollToTopButton';
import { useSidebarStore } from '../../store/sidebar-store';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Content only reserves the sidebar's width while it's pinned — unpinned, the sidebar floats
  // over the content on hover instead of pushing it (see Sidebar.tsx).
  const pinned = useSidebarStore((s) => s.pinned);

  return (
    <div className="min-h-screen">
      <Sidebar open={sidebarOpen} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 print:hidden lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`${pinned ? 'lg:ps-64' : ''} print:ps-0`}>
        <Topbar onMenuClick={() => setSidebarOpen((o) => !o)} />
        <main className="p-4 sm:p-6 print:p-0">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
      <ScrollToTopButton />
    </div>
  );
}
