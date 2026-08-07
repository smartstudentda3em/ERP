import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Input } from './Input';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

/** Dependency-free combobox: shows the selected option's label when closed, a free-text query
 * while open, and filters `options` by substring match on `label` as the user types. Built for
 * pickers with too many options to scan comfortably in a plain `<select>` (e.g. a large product
 * catalog) — no keyboard nav beyond what the browser gives a text input for free, matching this
 * codebase's other hand-rolled UI components (Tooltip.tsx, ConfirmDialog.tsx) rather than pulling
 * in a combobox library. */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    // The menu is portaled to document.body (see below), so it's no longer a DOM descendant of
    // containerRef — without also checking menuRef here, a mousedown on an option would count as
    // "outside" and close the menu before the option's own onClick ever gets to fire.
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // The options list is portaled to document.body (position: fixed, computed from this field's own
  // bounding rect) instead of rendered inline — this component routinely sits inside a
  // horizontally-scrollable table wrapper and/or a modal with its own overflow-y-auto, either of
  // which silently clips an inline absolutely-positioned dropdown. Recomputed on open and on
  // scroll/resize so it keeps tracking the field even if an ancestor scrolls.
  useLayoutEffect(() => {
    if (!open) return;
    function updateRect() {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setMenuRect({ top: rect.bottom, left: rect.left, width: rect.width });
    }
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [open]);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div ref={containerRef} className="relative">
      <Input
        style={{ paddingInlineEnd: '1.75rem' }}
        value={open ? query : selected?.label ?? ''}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button
        type="button"
        className="absolute end-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        onClick={() =>
          setOpen((prevOpen) => {
            const next = !prevOpen;
            if (next) setQuery('');
            return next;
          })
        }
      >
        ▾
      </button>
      {open &&
        menuRect &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width }}
            className="z-[60] mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg"
          >
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-[var(--text-muted)]">{t('common.noResults')}</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className="block w-full px-3 py-2 text-start text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => {
                  onChange(o.value);
                  setQuery('');
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
