import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Floating "back to top" button, mounted once in AppLayout so it's automatically present on
 * every screen — appears once the page has been scrolled down a bit, jumps back to the top on
 * click. Deliberately just a fixed-position button (not sticky/absolute inside any table or
 * scroll wrapper) so it can never end up trapped in — or covering content inside — a local
 * overflow context the way .app-table thead th's sticky header did (see index.css's comment on
 * that bug). */
export function ScrollToTopButton() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 400);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label={t('common.scrollToTop') ?? 'Scroll to top'}
      className="fixed bottom-6 end-6 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-all duration-200 hover:bg-primary-700 hover:shadow-xl active:scale-95 print:hidden"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
