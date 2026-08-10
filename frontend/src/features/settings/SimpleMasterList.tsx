import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getErrorMessage, unwrap } from '../../lib/api-client';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';

export interface SimpleField {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  /** For type: 'select' — the dropdown's options. */
  options?: { value: string; label: string }[];
  /** For type: 'select' — placeholder shown as the empty/unselected option. */
  placeholder?: string;
  /** Caps input length client-side — matters most for fields backed by a narrow DB column (e.g. a
   * currency's ISO code, varchar(10)), where exceeding it fails the save with a raw DB error
   * instead of a validation message. */
  maxLength?: number;
}

function defaultValue(f: SimpleField): string | boolean {
  return f.type === 'checkbox' ? false : '';
}

function emptyForm(fields: SimpleField[]): Record<string, string | boolean> {
  return Object.fromEntries(fields.map((f) => [f.name, defaultValue(f)]));
}

export function SimpleMasterList({
  endpoint,
  fields,
  columns,
  extraPayload,
  invalidateKeyPrefixes,
}: {
  endpoint: string;
  fields: SimpleField[];
  columns: Column<any>[];
  extraPayload?: Record<string, unknown>;
  /** Other screens read this master list under a different query key than [endpoint] — e.g. every
   * consumer of branches/warehouses queries ['branches', companyId] or ['warehouses-search', ...],
   * not ['/settings/branches']. invalidateQueries only matches by key prefix, so without this those
   * screens keep showing a renamed/deleted row's stale name until they separately remount. Each
   * entry here invalidates every cached query whose first key element starts with that string. */
  invalidateKeyPrefixes?: string[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));

  const listQuery = useQuery({
    queryKey: [endpoint],
    queryFn: () => unwrap<any[]>(apiClient.get(endpoint)),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: [endpoint] });
    for (const prefix of invalidateKeyPrefixes ?? []) {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith(prefix),
      });
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm(fields));
    saveMutation.reset();
    setModalOpen(true);
  }

  function openEdit(row: any) {
    setEditingId(row.id);
    setForm(
      Object.fromEntries(
        fields.map((f) => [f.name, f.type === 'checkbox' ? Boolean(row[f.name]) : (row[f.name] ?? '')]),
      ),
    );
    saveMutation.reset();
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { ...form, ...extraPayload };
      if (editingId) {
        return apiClient.patch(`${endpoint}/${editingId}`, payload);
      }
      // Only a fallback for master lists with no exposed `code` input at all — a screen that does
      // expose one (e.g. currencies' real ISO code) always sends its own value here, never this.
      if (!payload.code) {
        payload.code = `${endpoint.split('/').pop()?.toUpperCase().slice(0, 4)}-${Date.now()}`;
      }
      if (payload.nameEn && !payload.nameAr) {
        payload.nameAr = payload.nameEn;
      }
      // Some master lists (e.g. Companies) only show a single "الاسم" field bound to nameAr and
      // don't expose nameEn in the UI at all — the backend entity still requires it, so mirror
      // the value across rather than adding a hidden/duplicate input.
      if (payload.nameAr && !payload.nameEn) {
        payload.nameEn = payload.nameAr;
      }
      return apiClient.post(endpoint, payload);
    },
    onSuccess: () => {
      invalidateAll();
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm(fields));
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, t('common.saveFailed')));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`${endpoint}/${id}`),
    onSuccess: () => {
      invalidateAll();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, t('common.deleteFailed')));
    },
  });

  const columnsWithActions: Column<any>[] = [
    ...columns,
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
            onClick={async (e) => {
              e.stopPropagation();
              const ok = await confirm({ message: t('common.confirmDelete', { name: r.nameEn ?? r.name ?? '' }) });
              if (ok) deleteMutation.mutate(r.id);
            }}
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
      <DataTable
        columns={columnsWithActions}
        data={listQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={listQuery.isLoading}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? t('common.edit') : t('common.add')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          {fields.map((f) =>
            f.type === 'checkbox' ? (
              <label key={f.name} className="col-span-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form[f.name])}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })}
                />
                {f.label}
              </label>
            ) : f.type === 'select' ? (
              <FormField key={f.name} label={f.label} required={f.required}>
                <Select
                  required={f.required}
                  value={form[f.name] as string}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                >
                  <option value="">{f.placeholder ?? ''}</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField key={f.name} label={f.label}>
                <Input
                  type={f.type ?? 'text'}
                  required={f.required}
                  maxLength={f.maxLength}
                  value={form[f.name] as string}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              </FormField>
            ),
          )}
          {saveMutation.isError && (
            <p className="col-span-2 text-sm text-red-600">
              {getErrorMessage(saveMutation.error, t('common.saveFailed'))}
            </p>
          )}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
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
