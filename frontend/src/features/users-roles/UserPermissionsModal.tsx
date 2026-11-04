import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { ACTION_LABELS, CatalogEntry, groupCatalog } from '../../lib/permission-labels';

interface PermissionsResponse {
  user: { id: string; fullName: string; roles: string[]; isFounder: boolean };
  catalog: CatalogEntry[];
  roleCodes: string[];
  overrides: { code: string; effect: 'GRANT' | 'DENY' }[];
  effective: string[];
}

/**
 * The founder's per-user permission editor ("⋮" on a user row): every operation in the program, by
 * section, each with a checkbox. Saving sends the full set the user should end up with; the server
 * stores only the differences from what his roles already give him. Founder-only on the server too.
 */
export function UserPermissionsModal({ userId, userName, onClose }: { userId: string | null; userName: string; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: () => unwrap<PermissionsResponse>(apiClient.get(`/users/${userId}/permissions`)),
    enabled: !!userId,
    // Always the freshest state from the server when the editor opens.
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (query.data) {
      const inCatalog = new Set(query.data.catalog.map((c) => c.code));
      setChecked(new Set(query.data.effective.filter((c) => inCatalog.has(c))));
      setSearch('');
    }
  }, [query.data]);

  const sections = useMemo(() => groupCatalog(query.data?.catalog ?? []), [query.data]);
  const roleCodes = useMemo(() => new Set(query.data?.roleCodes ?? []), [query.data]);
  const original = useMemo(() => {
    const inCatalog = new Set((query.data?.catalog ?? []).map((c) => c.code));
    return new Set((query.data?.effective ?? []).filter((c) => inCatalog.has(c)));
  }, [query.data]);
  const changes = useMemo(() => {
    let n = 0;
    for (const c of checked) if (!original.has(c)) n++;
    for (const c of original) if (!checked.has(c)) n++;
    return n;
  }, [checked, original]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.put(`/users/${userId}/permissions`, { permissionCodes: [...checked] }),
    onSuccess: () => {
      toast.success('تم حفظ الصلاحيات');
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'تعذر حفظ الصلاحيات'),
  });

  function toggle(code: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function setMany(codes: string[], on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const c of codes) {
        if (on) next.add(c);
        else next.delete(c);
      }
      return next;
    });
  }

  const q = search.trim();

  return (
    <Modal open={!!userId} onClose={onClose} title={`صلاحيات: ${userName}`} widthClass="max-w-4xl">
      {query.isLoading || !query.data ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">جارٍ التحميل…</div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            الأدوار الحالية: {query.data.user.roles.join('، ') || '—'}. العلامة <span className="text-orange-500">●</span> تعني صلاحية
            مختلفة عمّا يعطيه الدور. سجل الإجراءات مقصور على صاحب النظام فقط ولا يظهر هنا.
          </p>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث عن عملية أو قسم…" />

          <div className="max-h-[55vh] space-y-4 overflow-y-auto pe-1">
            {sections.map((section) => {
              const modules = section.modules.filter((m) => !q || m.label.includes(q) || section.title.includes(q));
              if (!modules.length) return null;
              const sectionCodes = modules.flatMap((m) => m.entries.map((e) => e.code));
              const allOn = sectionCodes.every((c) => checked.has(c));
              return (
                <div key={section.key} className="rounded-lg border border-[var(--border)]">
                  <div className="flex items-center justify-between border-b border-[var(--border)] bg-black/5 px-3 py-2 dark:bg-white/5">
                    <span className="font-semibold">{section.title}</span>
                    <button type="button" className="text-xs text-primary-600 hover:underline" onClick={() => setMany(sectionCodes, !allOn)}>
                      {allOn ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                    </button>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {modules.map((m) => (
                      <div key={m.module} className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2">
                        <span className="w-44 shrink-0 text-sm font-medium">{m.label}</span>
                        {m.entries.map((e) => {
                          const custom = checked.has(e.code) !== roleCodes.has(e.code);
                          return (
                            <label key={e.code} className="flex cursor-pointer items-center gap-1.5 text-sm">
                              <input type="checkbox" checked={checked.has(e.code)} onChange={() => toggle(e.code)} />
                              <span>{ACTION_LABELS[e.action] ?? e.action}</span>
                              {custom && <span className="text-orange-500" title="مختلفة عن صلاحية الدور">●</span>}
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-[var(--text-muted)]">{changes ? `${changes} تغيير غير محفوظ` : 'لا توجد تغييرات'}</span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="button" disabled={!changes || saveMutation.isPending} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                حفظ التطبيق
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
