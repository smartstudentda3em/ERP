import {
  ChangeEvent,
  Children,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  forwardRef,
  isValidElement,
  useEffect,
} from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

/** Recursively collects every real (non-placeholder) `<option>` value under a Select's children —
 * walking through fragments, `.map()` arrays, and conditional branches exactly as React renders
 * them, so option lists built any of those ways are still detected correctly. A placeholder like
 * `<option value="">اختر مخزن…</option>` never counts, since its value is the empty string. */
function collectOptionValues(children: ReactNode): string[] {
  const values: string[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === 'option') {
      const v = (child.props as { value?: unknown }).value;
      if (v !== undefined && v !== null && String(v) !== '') values.push(String(v));
    } else {
      const nested = (child.props as { children?: ReactNode })?.children;
      if (nested) values.push(...collectOptionValues(nested));
    }
  });
  return values;
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, value, onChange, ...props }, ref) => {
    // System-wide auto-select: whenever a dropdown's real option list (excluding the "اختر…"
    // placeholder) resolves to exactly one choice, pick it automatically instead of leaving the
    // user to click through a list with no actual decision to make. Only fires while the field is
    // still on its empty placeholder value, so it never overwrites an existing selection, a locked
    // field, or a field that legitimately has multiple choices. Skipped for uncontrolled selects
    // (no value/onChange pair) and multi-selects, neither of which this rule makes sense for.
    useEffect(() => {
      if (props.multiple || value !== '' || !onChange) return;
      const optionValues = collectOptionValues(children);
      if (optionValues.length === 1) {
        onChange({ target: { value: optionValues[0] } } as unknown as ChangeEvent<HTMLSelectElement>);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [children, value, onChange, props.multiple]);

    return (
      <select
        ref={ref}
        value={value}
        onChange={onChange}
        className={`w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = 'Select';

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]" {...props} />;
}

export function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="ms-0.5 text-red-600">*</span>}
      </Label>
      {children}
    </div>
  );
}
