import { useTranslation } from 'react-i18next';
import { Input, FormField } from './Input';
import { Button } from './Button';

export interface DateRange {
  from: string;
  to: string;
}

/** Inclusive range check for 'YYYY-MM-DD' date strings — plain string comparison is safe since ISO dates sort lexicographically in chronological order. */
export function inDateRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex flex-wrap items-end gap-3">
      <FormField label={t('common.fromDate')}>
        <Input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </FormField>
      <FormField label={t('common.toDate')}>
        <Input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </FormField>
      <Button type="button" variant="secondary" onClick={() => onChange(value)}>
        {t('common.filter')}
      </Button>
      <Button type="button" variant="ghost" onClick={() => onChange({ from: '', to: '' })}>
        {t('common.resetFilter')}
      </Button>
    </div>
  );
}
