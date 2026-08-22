import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField } from '../../components/ui/Input';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';

interface ServiceTier {
  id: string;
  capacity: string | null;
  price: number;
}

interface ServiceItem {
  id: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  tiers: ServiceTier[];
}

interface TierForm {
  capacity: string;
  price: string;
}

function emptyTier(): TierForm {
  return { capacity: '', price: '0' };
}

/**
 * Air Conditioning only — "الخدمات" tab (installation, maintenance, ...), reached from
 * ProductsPage.tsx's tab switcher. Each service (e.g. "تركيب مكيف") is just a name grouping a set
 * of capacity price tiers (e.g. 1.5 حصان → 150, 2.25 حصان → 200) — under the hood every tier is a
 * real Product row (productType=SERVICE) the existing Sales Invoice line picker can already sell
 * directly, so nothing about the sales/invoicing pipeline needed to change for this feature; only
 * this management screen and the picker's own service-aware fetch (see SalesLineEditor.tsx) are new.
 */
export function ServicesTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const servicesQuery = useQuery({
    queryKey: ['services'],
    queryFn: () => unwrap<ServiceItem[]>(apiClient.get('/inventory/products/services')),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [tiers, setTiers] = useState<TierForm[]>([emptyTier()]);

  function resetForm() {
    setName('');
    setNotes('');
    setTiers([emptyTier()]);
  }

  function openCreate() {
    setEditingId(null);
    resetForm();
    setModalOpen(true);
  }

  function openEdit(service: ServiceItem) {
    setEditingId(service.id);
    setName(service.name);
    setNotes(service.notes ?? '');
    setTiers(
      service.tiers.length
        ? service.tiers.map((t) => ({ capacity: t.capacity ?? '', price: String(t.price) }))
        : [emptyTier()],
    );
    setModalOpen(true);
  }

  function updateTier(index: number, patch: Partial<TierForm>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }
  function addTier() {
    setTiers((prev) => [...prev, emptyTier()]);
  }
  function removeTier(index: number) {
    setTiers((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const payloadTiers = () =>
    tiers
      .filter((t) => t.capacity.trim())
      .map((t) => ({ capacity: t.capacity.trim(), price: Number(t.price) || 0 }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name, notes: notes || undefined, tiers: payloadTiers() };
      return editingId
        ? apiClient.patch(`/inventory/products/services/${editingId}`, body)
        : apiClient.post('/inventory/products/services', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setModalOpen(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/inventory/products/services/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDelete(service: ServiceItem) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: service.name }) });
    if (ok) deleteMutation.mutate(service.id);
  }

  return (
    <div>
      <div className="mb-3 flex justify-end print:hidden">
        <Button onClick={openCreate}>+ {t('products.addService')}</Button>
      </div>

      {servicesQuery.isLoading ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
          {t('common.loading')}
        </div>
      ) : (servicesQuery.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
          {t('products.noServices')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(servicesQuery.data ?? []).map((service) => (
            <Card key={service.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="font-semibold">{service.name}</div>
                <div className="flex gap-3 text-sm">
                  <button type="button" className="text-primary-600 hover:underline" onClick={() => openEdit(service)}>
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    disabled={deleteMutation.isPending}
                    onClick={() => handleDelete(service)}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
              {service.notes && <div className="mb-2 text-xs text-[var(--text-muted)]">{service.notes}</div>}
              <table className="app-table w-full">
                <thead>
                  <tr>
                    <th>{t('products.capacityLabel')}</th>
                    <th>{t('products.servicePrice')}</th>
                  </tr>
                </thead>
                <tbody>
                  {service.tiers.map((tier) => (
                    <tr key={tier.id}>
                      <td>{tier.capacity ?? '—'}</td>
                      <td>{formatAmount(tier.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('common.edit') : t('products.addService')}
        widthClass="max-w-2xl"
      >
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <FormField label={t('products.serviceName')}>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('products.serviceNamePlaceholder') ?? ''} />
          </FormField>
          <FormField label={t('table.description')}>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>

          <div className="rounded-lg border border-[var(--border)] p-3">
            <div className="mb-2 text-sm font-medium">{t('products.priceTiers')}</div>
            {tiers.map((tier, idx) => (
              <div key={idx} className="mb-2 grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <Input
                  required
                  placeholder={t('products.capacityLabel') ?? ''}
                  value={tier.capacity}
                  onChange={(e) => updateTier(idx, { capacity: e.target.value })}
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder={t('products.servicePrice') ?? ''}
                  value={tier.price}
                  onChange={(e) => updateTier(idx, { price: e.target.value })}
                />
                <Button type="button" variant="secondary" onClick={() => removeTier(idx)}>
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addTier}>
              + {t('products.addTier')}
            </Button>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
