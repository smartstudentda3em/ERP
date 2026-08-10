import { MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getErrorMessage, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/auth-store';

interface CatalogProduct {
  id: string;
  nameEn: string;
  size?: string | null;
  notes?: string | null;
  sellingPrice: number | null;
}

const emptyForm = { name: '', size: '', notes: '', sellingPrice: '' };

/**
 * "المنتجات" — Printing Press only (see RequirePrintingPress on this route in router.tsx). A pure
 * sales price-list: no stock, no packaging, no suppliers — just what the press sells to its own
 * customers, so the السعر الاسترشادي auto-fills (editably) as the unit price wherever this
 * catalog is picked in SalesLineEditor. Backed by the same `products` table as raw materials
 * (ProductType.CATALOG_ITEM) purely to reuse its name/sellingPrice plumbing — see
 * ProductsService.createCatalogItem for why unit/package/category are invisible defaults here.
 */
export function PrintingProductsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const canCreate = useAuthStore((s) => s.hasPermission('inventory.product.create'));
  const canEdit = useAuthStore((s) => s.hasPermission('inventory.product.edit'));
  const canDelete = useAuthStore((s) => s.hasPermission('inventory.product.delete'));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');

  const productsQuery = useQuery({
    queryKey: ['printing-products', companyId],
    queryFn: () => unwrap<CatalogProduct[]>(apiClient.get('/inventory/products/catalog', { params: { companyId } })),
    enabled: !!companyId,
  });

  const filteredProducts = (productsQuery.data ?? []).filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.nameEn, p.size].some((v) => (v ?? '').toLowerCase().includes(q));
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/inventory/products/catalog', {
        nameEn: form.name,
        size: form.size || undefined,
        notes: form.notes || undefined,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printing-products'] });
      setModalOpen(false);
      setForm(emptyForm);
      toast.success(t('common.addedSuccessfully'));
    },
    onError: (err: any) => toast.error(getErrorMessage(err, t('common.saveFailed'))),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/inventory/products/catalog/${editingId}`, {
        nameEn: form.name,
        size: form.size || undefined,
        notes: form.notes || undefined,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printing-products'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(t('common.savedSuccessfully'));
    },
    onError: (err: any) => toast.error(getErrorMessage(err, t('common.saveFailed'))),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/inventory/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printing-products'] });
    },
    onError: (err: any) => toast.error(getErrorMessage(err, t('common.saveFailed'))),
  });

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(product: CatalogProduct) {
    setEditingId(product.id);
    setForm({
      name: product.nameEn,
      size: product.size ?? '',
      notes: product.notes ?? '',
      sellingPrice: product.sellingPrice != null ? String(product.sellingPrice) : '',
    });
    setModalOpen(true);
  }

  async function handleDelete(e: MouseEvent, product: CatalogProduct) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: product.nameEn }) });
    if (ok) deleteMutation.mutate(product.id);
  }

  // Printing Press only (this whole page is gated by RequirePrintingPress in router.tsx — no
  // other tenant ever renders this table). المواصفات carries the free-text description a press
  // customer actually reads, so it's the one column left without a width — under the table's
  // default table-layout: auto, an unconstrained column absorbs whatever space the other,
  // explicitly-narrow columns don't need, which is the table-cell equivalent of flex-1.
  const columns: Column<CatalogProduct>[] = [
    { header: t('common.name'), accessor: (r) => r.nameEn, width: '10rem' },
    { header: t('printingProducts.sizeOrCode'), accessor: (r) => r.size ?? '—', width: '8rem' },
    { header: t('printingProducts.specifications'), accessor: (r) => r.notes ?? '—' },
    {
      header: t('printingProducts.guidancePrice'),
      accessor: (r) => (r.sellingPrice != null ? formatAmount(r.sellingPrice) : '—'),
      align: 'right',
      width: '9rem',
    },
    ...(canEdit || canDelete
      ? [
          {
            header: t('common.actions'),
            accessor: (r: CatalogProduct) => (
              <div className="flex justify-center gap-3">
                {canEdit && (
                  <button
                    type="button"
                    className="text-primary-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(r);
                    }}
                  >
                    {t('common.edit')}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={(e) => handleDelete(e, r)}
                    disabled={deleteMutation.isPending}
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            ),
            align: 'center' as const,
            width: '1%',
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.printingProducts')}
        actions={canCreate ? <Button onClick={openCreateModal}>+ {t('printingProducts.addNew')}</Button> : undefined}
      />

      <div className="mb-3 max-w-sm">
        <Input
          type="search"
          placeholder={t('products.searchPlaceholder') ?? ''}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredProducts}
        keyField={(r) => r.id}
        isLoading={productsQuery.isLoading}
        searchable={false}
      />

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        title={editingId ? t('common.edit') : t('printingProducts.addNew')}
      >
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editingId) updateMutation.mutate();
            else createMutation.mutate();
          }}
        >
          <FormField label={t('printingProducts.productName')} required>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label={t('printingProducts.sizeOrCode')}>
            <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
          </FormField>
          <FormField label={t('printingProducts.specifications')}>
            <textarea
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-primary-500"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </FormField>
          <FormField label={t('printingProducts.guidancePrice')}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.sellingPrice}
              onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
            />
          </FormField>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setEditingId(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
