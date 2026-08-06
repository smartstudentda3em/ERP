import { ReactNode } from 'react';

/** CSS-only hover tooltip — shows/hides via `hidden`/`block` (no opacity transition), so it
 * appears and disappears instantly with no delay, and follows the ancestor's `dir` via logical
 * properties (`start-1/2` + the `rtl:` variant) so it stays centered under the trigger in both
 * Arabic and English layouts. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full start-1/2 z-30 mb-2 hidden -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-start text-xs leading-relaxed whitespace-nowrap text-white shadow-lg group-hover/tooltip:block rtl:translate-x-1/2 dark:bg-gray-700"
      >
        {content}
        <span className="absolute start-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900 rtl:translate-x-1/2 dark:border-t-gray-700" />
      </span>
    </span>
  );
}
