import { ReactNode } from 'react';

export function Modal({
  open,
  onClose,
  title,
  headerActions,
  children,
  widthClass = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional controls (e.g. طباعة/تصدير PDF) rendered next to the title, before the close button —
   * same slot pattern as PageHeader's `actions` prop. */
  headerActions?: ReactNode;
  children: ReactNode;
  widthClass?: string;
}) {
  if (!open) return null;
  return (
    // A modal is screen chrome, never print content — its own printable region (if any) is
    // rendered by the caller as a sibling, not as a child here, precisely so it isn't caught by
    // this print:hidden and hidden along with the rest of the modal.
    //
    // The scrollable element is the INNER box (max-h + its own overflow-y-auto), not this outer
    // `fixed` overlay — a `position: fixed` ancestor scrolling its own overflow is a known-flaky
    // pattern on Android WebView/TWA touch-scroll (the gesture doesn't always get captured), which
    // silently stranded the Save button below the fold on a long form (e.g. the Sales Invoice
    // modal) with no way to reach it. A normal in-flow scrollable block doesn't have that problem.
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16 print:hidden">
      <div
        className={`w-full ${widthClass} max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl`}
        style={{ WebkitOverflowScrolling: 'touch' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              onClick={onClose}
              className="rounded-full p-1 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
