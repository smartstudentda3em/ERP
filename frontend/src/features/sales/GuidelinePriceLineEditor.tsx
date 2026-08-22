import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, unwrap } from '../../lib/api-client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

export interface GuidelinePriceLineForm {
  productId: string;
  price: string;
}

export function emptyGuidelinePriceLine(): GuidelinePriceLineForm {
  return { productId: '', price: '' };
}

export function guidelineLinesToPayload(lines: GuidelinePriceLineForm[]) {
  return lines
    .filter((l) => l.productId && l.price !== '')
    .map((l) => ({ productId: l.productId, price: Number(l.price) }));
}

interface Product {
  id: string;
  sku?: string | null;
  nameEn: string;
}

interface Props {
  lines: GuidelinePriceLineForm[];
  onChange: (lines: GuidelinePriceLineForm[]) => void;
}

/** A stripped-down sibling of SalesLineEditor for this AC-only screen — no quantity, no
 * unit/package toggle, no below-cost warning, just "which model" + "its guideline price this
 * month" per row. */
export function GuidelinePriceLineEditor({ lines, onChange }: Props) {
  const { t } = useTranslation();
  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => unwrap<Product[]>(apiClient.get('/inventory/products')),
  });
  const productOptions = (productsQuery.data ?? []).map((p) => ({
    value: p.id,
    label: p.sku ? `${p.sku} — ${p.nameEn}` : p.nameEn,
  }));

  function updateLine(index: number, patch: Partial<GuidelinePriceLineForm>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="app-table">
          <thead>
            <tr>
              <th>{t('guidelinePrices.model')}</th>
              <th>{t('guidelinePrices.price')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td>
                  <SearchableSelect
                    options={productOptions}
                    value={line.productId}
                    onChange={(v) => updateLine(i, { productId: v })}
                    placeholder={t('guidelinePrices.selectModel') ?? ''}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={line.price}
                    onChange={(e) => updateLine(i, { price: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-lg leading-none hover:bg-black/5 dark:hover:bg-white/5"
                    onClick={() => removeLine(i)}
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="secondary" onClick={() => onChange([...lines, emptyGuidelinePriceLine()])}>
        + {t('guidelinePrices.addLine')}
      </Button>
    </div>
  );
}
