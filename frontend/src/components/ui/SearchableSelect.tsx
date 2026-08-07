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
 * catalog) — full keyboard nav (↓/↑ to move, Enter to pick, Esc to close), matching this
 * codebase's other hand-rolled UI components (Tooltip.tsx, ConfirmDialog.tsx) rather than pulling
 * in a combobox library. */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  required,
  disabled,
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
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

  // Keep the highlighted row in sync with the filtered list — reset to the currently selected
  // option (or the top row) every time the menu opens or the query changes, so arrow keys always
  // start from a sensible place instead of an index left over from a previous filter pass.
  // Deliberately NOT depending on `filtered`/`options`: the caller typically passes a freshly
  // mapped array on every render (e.g. `categoriesQuery.data.map(...)`), so a reference-based
  // dependency would re-run this effect — and stomp the index arrow keys just set — on every
  // unrelated re-render, not only when the option set actually changes.
  useEffect(() => {
    if (!open) return;
    if (filtered.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    const selectedIndex = filtered.findIndex((o) => o.value === value);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    menuRef.current
      ?.querySelector(`[data-option-index="${highlightedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, highlightedIndex]);

  function selectOption(o: SearchableSelectOption) {
    onChange(o.value);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setOpen(true);
        setQuery('');
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => (filtered.length === 0 ? -1 : (i + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (filtered.length === 0 ? -1 : (i - 1 + filtered.length) % filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && filtered[highlightedIndex]) selectOption(filtered[highlightedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <span className="pointer-events-none absolute start-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <Input
        style={{ paddingInlineStart: '1.75rem', paddingInlineEnd: '1.75rem' }}
        value={open ? query : (selected?.label ?? '')}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {required && (
        // Invisible native input that mirrors `value` purely so the browser's built-in "please
        // fill out this field" constraint validation still fires on submit — the visible field
        // above is a div/button-based combobox, not a real form control, so it can't carry
        // `required` itself.
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          style={{ position: 'absolute', inset: 0, height: 0, width: '100%', opacity: 0, border: 0, padding: 0 }}
        />
      )}
      <button
        type="button"
        disabled={disabled}
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
            {filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                data-option-index={i}
                className={`block w-full px-3 py-2 text-start text-sm ${
                  i === highlightedIndex ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                onMouseEnter={() => setHighlightedIndex(i)}
                onClick={() => selectOption(o)}
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
