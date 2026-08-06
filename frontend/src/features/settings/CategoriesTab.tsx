import { MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';

const CATEGORIES_ENDPOINT = '/settings/product-categories';
const PACKAGES_ENDPOINT = '/settings/package-types';
const UNITS_ENDPOINT = '/settings/units';
const BRANDS_ENDPOINT = '/settings/brands';

interface ProductCategory {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface TaggedItem {
  id: string;
  nameEn: string;
  nameAr?: string | null;
  categoryId: string;
}

/** One "العبوات/الوحدات/الماركات المتاحة" row inside the category modal — existing items for this
 * category shown as removable tags, plus a small input to add a new one by name. Every add/remove
 * hits the same package-types/units/brands endpoints that used to have their own standalone
 * Settings tabs (folded into this modal per the category-first restructuring) — their storage
 * never changed, only where they're edited from. */
function TagListField({
  label,
  items,
  endpoint,
  categoryId,
  codePrefix,
  requireCode,
}: {
  label: string;
  items: TaggedItem[];
  endpoint: string;
  categoryId: string;
  codePrefix: string;
  requireCode: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState('');

  const addMutation = useMutation({
    mutationFn: (name: string) =>
      apiClient.post(endpoint, {
        nameEn: name,
        nameAr: name,
        categoryId,
        ...(requireCode ? { code: `${codePrefix}-${Date.now()}` } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      setValue('');
      toast.success(t('common.addedSuccessfully'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`${endpoint}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  function submitTag() {
    const name = value.trim();
    if (!name || addMutation.isPending) return;
    addMutation.mutate(name);
  }

  return (
    <div>
      <div className="mb-1 text-sm font-medium text-[var(--text)]">{label}</div>
      <div className="mb-2 flex flex-wrap gap-2">
        {items.length === 0 && (
          <span className="text-sm text-[var(--text-muted)]">{t('settingsCategories.noItemsYet')}</span>
        )}
        {items.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-0.5 ps-2.5 pe-1.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {item.nameAr || item.nameEn}
            <button
              type="button"
              className="text-gray-500 hover:text-red-600 disabled:opacity-50"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate(item.id)}
              aria-label={t('common.delete') ?? ''}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('settingsCategories.addItemPlaceholder') ?? ''}
          disabled={addMutation.isPending}
          // Nothing in this modal is wrapped in a <form> (every button below is type="button"),
          // so there's no submit for Enter to trigger prematurely — this just intercepts it to add
          // the tag instead of doing nothing.
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitTag();
            }
          }}
        />
        <Button type="button" variant="secondary" disabled={addMutation.isPending || !value.trim()} onClick={submitTag}>
          + {t('common.add')}
        </Button>
      </div>
    </div>
  );
}

/** Categories are now the core entity that owns the packages/units/brands available for products
 * in that category — replaces the previous three standalone Settings tabs (Packages/Units/Brands),
 * which are no longer reachable as separate screens. Nothing about how those three are stored
 * changed (still their own tables, each row still has a real id referenced by
 * Product.packageTypeId/unitId/brandId) — only where they're created/removed from. */
export function CategoriesTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState('');

  const categoriesQuery = useQuery({
    queryKey: [CATEGORIES_ENDPOINT],
    queryFn: () => unwrap<ProductCategory[]>(apiClient.get(CATEGORIES_ENDPOINT)),
  });
  // Only fetched while the modal is open — these three back the tag lists below, not the outer
  // category list/table.
  const packagesQuery = useQuery({
    queryKey: [PACKAGES_ENDPOINT],
    queryFn: () => unwrap<TaggedItem[]>(apiClient.get(PACKAGES_ENDPOINT)),
    enabled: modalOpen,
  });
  const unitsQuery = useQuery({
    queryKey: [UNITS_ENDPOINT],
    queryFn: () => unwrap<TaggedItem[]>(apiClient.get(UNITS_ENDPOINT)),
    enabled: modalOpen,
  });
  const brandsQuery = useQuery({
    queryKey: [BRANDS_ENDPOINT],
    queryFn: () => unwrap<TaggedItem[]>(apiClient.get(BRANDS_ENDPOINT)),
    enabled: modalOpen,
  });

  function openCreate() {
    setEditingId(null);
    setNameEn('');
    setModalOpen(true);
  }

  function openEdit(row: ProductCategory) {
    setEditingId(row.id);
    setNameEn(row.nameEn);
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Captured before the request goes out — editingId itself is about to be overwritten (for a
      // create) once the response comes back, so this is the only reliable point to remember
      // which case we were actually in for the onSuccess branch below (close-and-refetch on an
      // existing category vs. stay-open-in-edit-mode for a brand-new one).
      const wasCreating = !editingId;
      const saved = editingId
        ? await unwrap<ProductCategory>(apiClient.patch(`${CATEGORIES_ENDPOINT}/${editingId}`, { nameEn, nameAr: nameEn }))
        : await unwrap<ProductCategory>(
            apiClient.post(CATEGORIES_ENDPOINT, { nameEn, nameAr: nameEn, code: `CAT-${Date.now()}` }),
          );
      return { saved, wasCreating };
    },
    onSuccess: ({ saved, wasCreating }) => {
      // Refetches the table behind the modal — invalidateQueries is React Query's equivalent of a
      // manual refetch()/fetchData() call, and fires regardless of which branch below runs.
      queryClient.invalidateQueries({ queryKey: [CATEGORIES_ENDPOINT] });
      toast.success(t('common.savedSuccessfully'));
      if (wasCreating) {
        // A brand-new category has no id yet to attach packages/units/brands to — switch the
        // modal straight into edit mode on the row the server just created so the tag fields
        // become usable immediately, instead of closing and making the user reopen it. This is a
        // deliberate exception to "close on success": closing here would strand the user with no
        // way to add this category's packages/units/brands without reopening it themselves.
        setEditingId(saved.id);
      } else {
        // Editing an existing category's name has nothing left to do in this modal — close it.
        setModalOpen(false);
        setEditingId(null);
        setNameEn('');
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`${CATEGORIES_ENDPOINT}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATEGORIES_ENDPOINT] });
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  async function handleDelete(e: MouseEvent, row: ProductCategory) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: row.nameAr || row.nameEn }) });
    if (ok) deleteMutation.mutate(row.id);
  }

  const rows = categoriesQuery.data ?? [];

  const columns: Column<ProductCategory>[] = [
    { header: t('common.name'), accessor: (r) => r.nameAr || r.nameEn },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="text-primary-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(r);
            }}
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            disabled={deleteMutation.isPending}
            onClick={(e) => handleDelete(e, r)}
          >
            {t('common.delete')}
          </button>
        </div>
      ),
      align: 'center',
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={openCreate}>+ {t('common.add')}</Button>
      </div>

      <DataTable columns={columns} data={rows} keyField={(r) => r.id} isLoading={categoriesQuery.isLoading} searchable={false} />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('common.edit') : t('common.add')}
        widthClass="max-w-2xl"
      >
        <div className="space-y-4">
          <FormField label={t('common.name')}>
            <Input
              required
              value={nameEn}
              disabled={saveMutation.isPending}
              onChange={(e) => setNameEn(e.target.value)}
            />
          </FormField>

          {editingId ? (
            <>
              <TagListField
                label={t('settingsCategories.availablePackages')}
                items={(packagesQuery.data ?? []).filter((p) => p.categoryId === editingId)}
                endpoint={PACKAGES_ENDPOINT}
                categoryId={editingId}
                codePrefix="PKG"
                requireCode={false}
              />
              <TagListField
                label={t('settingsCategories.availableUnits')}
                items={(unitsQuery.data ?? []).filter((u) => u.categoryId === editingId)}
                endpoint={UNITS_ENDPOINT}
                categoryId={editingId}
                codePrefix="UNIT"
                requireCode
              />
              <TagListField
                label={t('settingsCategories.availableBrands')}
                items={(brandsQuery.data ?? []).filter((b) => b.categoryId === editingId)}
                endpoint={BRANDS_ENDPOINT}
                categoryId={editingId}
                codePrefix="BRAND"
                requireCode
              />
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">{t('settingsCategories.saveFirstHint')}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              loading={saveMutation.isPending}
              disabled={!nameEn.trim()}
              onClick={() => saveMutation.mutate()}
            >
              {editingId ? t('common.save') : t('common.add')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
