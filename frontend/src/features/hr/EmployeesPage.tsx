import { MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { EmployeeDetailModal } from './EmployeeDetailModal';

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface Employee {
  id: string;
  name: string;
  jobTitle: string;
  phone: string | null;
  email: string | null;
  branchId: string;
  branch?: Branch | null;
  baseSalary: number;
  isActive: boolean;
  salesRepresentativeId: string | null;
}

const emptyForm = { name: '', jobTitle: '', phone: '', email: '', branchId: '', baseSalary: '', isActive: true };

export function EmployeesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: !!companyId,
  });

  const employeesQuery = useQuery({
    queryKey: ['hr-employees', companyId, search, branchFilter],
    queryFn: () =>
      unwrap<Employee[]>(
        apiClient.get('/hr/employees', { params: { search: search || undefined, branchId: branchFilter || undefined } }),
      ),
    enabled: !!companyId,
  });

  // Single-branch companies (Stationery/AC today) never make the user pick — same auto-select
  // convention used system-wide for single-option dropdowns.
  const branches = branchesQuery.data ?? [];
  // Rep-linked employees are read-only for identity fields here — see EmployeesService.update()'s
  // matching server-side guard, which silently ignores those fields for such a row regardless of
  // what the client sends (SalesRepresentativesService.syncEmployeeForRep owns them instead).
  const isSynced = !!editingEmployee?.salesRepresentativeId;

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, baseSalary: Number(form.baseSalary) || 0 };
      return editingId ? apiClient.patch(`/hr/employees/${editingId}`, payload) : apiClient.post('/hr/employees', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/hr/employees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  function openCreate() {
    setEditingId(null);
    setEditingEmployee(null);
    setForm({ ...emptyForm, branchId: branches.length === 1 ? branches[0].id : '' });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(e: MouseEvent, employee: Employee) {
    e.stopPropagation();
    setEditingId(employee.id);
    setEditingEmployee(employee);
    setForm({
      name: employee.name,
      jobTitle: employee.jobTitle,
      phone: employee.phone ?? '',
      email: employee.email ?? '',
      branchId: employee.branchId,
      baseSalary: String(employee.baseSalary),
      isActive: employee.isActive,
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleDelete(e: MouseEvent, employee: Employee) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: employee.name }) });
    if (ok) deleteMutation.mutate(employee.id);
  }

  const columns: Column<Employee>[] = [
    {
      header: t('hr.employeeName'),
      accessor: (r) => (
        <div className="flex items-center gap-1.5">
          <span>{r.name}</span>
          {r.salesRepresentativeId && (
            <Badge color="blue" title={t('hr.syncedFromRepHint') ?? ''}>
              {t('hr.syncedFromRep')}
            </Badge>
          )}
        </div>
      ),
      width: '22%',
    },
    { header: t('hr.jobTitle'), accessor: (r) => r.jobTitle, width: '18%' },
    { header: t('fields.branch'), accessor: (r) => r.branch?.nameAr || r.branch?.nameEn || '—', width: '18%' },
    { header: t('hr.baseSalary'), accessor: (r) => formatAmount(r.baseSalary), align: 'right', width: '15%' },
    {
      header: t('common.status'),
      accessor: (r) =>
        r.isActive ? <Badge color="green">{t('common.active')}</Badge> : <Badge color="red">{t('common.inactive')}</Badge>,
      width: '10%',
    },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button type="button" className="text-primary-600 hover:underline" onClick={(e) => openEdit(e, r)}>
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            onClick={(e) => handleDelete(e, r)}
            disabled={deleteMutation.isPending}
          >
            {t('common.delete')}
          </button>
        </div>
      ),
      align: 'center',
      width: '17%',
    },
  ];

  return (
    <div>
      {/* Wrapped so this list never co-prints with an open EmployeeDetailModal's salary-slip
          report — that report is rendered as a print-only sibling fragment, not inside the modal
          (see EmployeeDetailModal.tsx), so this is the only thing left that would otherwise show. */}
      <div className="print:hidden">
        <PageHeader title={t('nav.employees')} actions={<Button onClick={openCreate}>+ {t('common.create')}</Button>} />

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex w-72 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3">
            <span className="text-sm text-[var(--text-muted)]">🔍</span>
            <input
              className="w-full border-0 bg-transparent py-2 text-sm text-[var(--text)] outline-none"
              placeholder={t('hr.searchByNameOrTitle')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-56">
            <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">{t('hr.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr || b.nameEn}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={employeesQuery.data ?? []}
          keyField={(r) => r.id}
          isLoading={employeesQuery.isLoading}
          searchable={false}
          onRowClick={(r) => setViewingId(r.id)}
        />
      </div>

      {viewingId && <EmployeeDetailModal employeeId={viewingId} onClose={() => setViewingId(null)} />}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
          setEditingEmployee(null);
        }}
        title={editingId ? t('common.edit') : t('common.create')}
      >
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          {isSynced && (
            <p className="col-span-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
              {t('hr.syncedFromRepNote')}
            </p>
          )}
          <FormField label={t('hr.employeeName')}>
            <Input
              required
              disabled={isSynced}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField label={t('hr.jobTitle')}>
            <Input required value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          </FormField>
          <FormField label={t('fields.phone')}>
            <Input
              disabled={isSynced}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.email')}>
            <Input
              type="email"
              disabled={isSynced}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.branch')}>
            <Select
              required
              disabled={isSynced}
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              <option value="" disabled>
                {t('common.select')}
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr || b.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('hr.baseSalary')}>
            <Input
              type="number"
              min={0}
              required
              value={form.baseSalary}
              onChange={(e) => setForm({ ...form, baseSalary: e.target.value })}
            />
          </FormField>
          <FormField label={t('common.status')}>
            <Select
              disabled={isSynced}
              value={form.isActive ? '1' : '0'}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })}
            >
              <option value="1">{t('common.active')}</option>
              <option value="0">{t('common.inactive')}</option>
            </Select>
          </FormField>
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
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
