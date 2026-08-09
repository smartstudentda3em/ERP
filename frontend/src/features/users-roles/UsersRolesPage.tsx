import { MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useAccessibleCompanies } from '../../lib/companies';

const PROTECTED_ADMIN_EMAIL = 'aymanmakroum83@gmail.com';

interface Role {
  id: string;
  name: string;
  isSystemRole: boolean;
  restrictedCompanyId?: string | null;
}
interface User {
  id: string;
  email?: string | null;
  fullName: string;
  phone: string;
  isActive: boolean;
  branchId?: string | null;
  roles: Role[];
  companyIds?: string[];
}
interface BranchOption {
  id: string;
  nameAr: string;
  nameEn: string;
}

function isProtectedAdmin(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === PROTECTED_ADMIN_EMAIL;
}

// The exact role name the "add user" form treats as a branch manager — matches
// BRANCH_MANAGER_ROLE_NAME in backend/src/modules/users/users.service.ts.
const BRANCH_MANAGER_ROLE_NAME = 'مدير فرع';

export function UsersRolesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    phone: '',
    password: '',
    roleId: '',
    branchId: '',
    companyIds: [] as string[],
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    email: '',
    fullName: '',
    phone: '',
    password: '',
    roleId: '',
    branchId: '',
    isActive: true,
    companyIds: [] as string[],
  });
  const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
  const [passwordResetValue, setPasswordResetValue] = useState('');
  const [showPasswordResetValue, setShowPasswordResetValue] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => unwrap<User[]>(apiClient.get('/users')),
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => unwrap<Role[]>(apiClient.get('/roles')),
  });

  // Only a true Administrator may freely manage every company; every other role is restricted to
  // whichever companies an admin explicitly assigns here — enforced independently server-side
  // (see UsersService/AuthService), this control just drives the picker.
  const companiesQuery = useAccessibleCompanies(modalOpen || !!editingUserId);
  const isCreateRoleAdmin = rolesQuery.data?.find((r) => r.id === form.roleId)?.isSystemRole ?? false;
  const isEditRoleAdmin = rolesQuery.data?.find((r) => r.id === editForm.roleId)?.isSystemRole ?? false;
  // A role like "مدير فرع - المطبعة" hard-locks any user given it to one company — enforced
  // server-side regardless (see UsersService), this just keeps the picker from suggesting a
  // choice that would be overridden anyway.
  const createRestrictedCompanyId = rolesQuery.data?.find((r) => r.id === form.roleId)?.restrictedCompanyId ?? null;
  const editRestrictedCompanyId = rolesQuery.data?.find((r) => r.id === editForm.roleId)?.restrictedCompanyId ?? null;
  const createRestrictedCompanyName =
    (companiesQuery.data ?? []).find((c) => c.id === createRestrictedCompanyId)?.nameAr ??
    (companiesQuery.data ?? []).find((c) => c.id === createRestrictedCompanyId)?.nameEn ??
    '';
  const editRestrictedCompanyName =
    (companiesQuery.data ?? []).find((c) => c.id === editRestrictedCompanyId)?.nameAr ??
    (companiesQuery.data ?? []).find((c) => c.id === editRestrictedCompanyId)?.nameEn ??
    '';

  // "مدير فرع" is the one role whose form shows a conditional branch picker (see
  // BRANCH_MANAGER_ROLE_NAME in UsersService) — sourced from Settings > Branches for that role's
  // own restricted company, not necessarily whichever company the current admin has active.
  const createIsBranchManager = rolesQuery.data?.find((r) => r.id === form.roleId)?.name === BRANCH_MANAGER_ROLE_NAME;
  const editIsBranchManager = rolesQuery.data?.find((r) => r.id === editForm.roleId)?.name === BRANCH_MANAGER_ROLE_NAME;
  const branchManagerCompanyId = modalOpen ? createRestrictedCompanyId : editRestrictedCompanyId;
  const branchesQuery = useQuery({
    queryKey: ['branches-for-role', branchManagerCompanyId],
    queryFn: () =>
      unwrap<BranchOption[]>(apiClient.get('/settings/branches', { params: { companyId: branchManagerCompanyId } })),
    enabled: !!branchManagerCompanyId && (createIsBranchManager || editIsBranchManager),
  });
  const createSelectedBranchName =
    (branchesQuery.data ?? []).find((b) => b.id === form.branchId)?.nameAr ??
    (branchesQuery.data ?? []).find((b) => b.id === form.branchId)?.nameEn ??
    '';
  const editSelectedBranchName =
    (branchesQuery.data ?? []).find((b) => b.id === editForm.branchId)?.nameAr ??
    (branchesQuery.data ?? []).find((b) => b.id === editForm.branchId)?.nameEn ??
    '';

  function toggleCompany(list: string[], companyId: string): string[] {
    return list.includes(companyId) ? list.filter((id) => id !== companyId) : [...list, companyId];
  }

  const createUserMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/users', {
        email: form.email || undefined,
        fullName: form.fullName,
        phone: form.phone,
        password: form.password,
        roleIds: form.roleId ? [form.roleId] : [],
        branchId: createIsBranchManager && form.branchId ? form.branchId : undefined,
        companyIds: isCreateRoleAdmin
          ? []
          : createRestrictedCompanyId
            ? [createRestrictedCompanyId]
            : form.companyIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['sales-representatives'] });
      setModalOpen(false);
      setForm({ email: '', fullName: '', phone: '', password: '', roleId: '', branchId: '', companyIds: [] });
      toast.success(t('userMgmt.userCreated'));
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('userMgmt.userDeleted'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  async function handleDeleteUser(e: MouseEvent, user: User) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: user.fullName }) });
    if (ok) deleteUserMutation.mutate(user.id);
  }

  const updateUserMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/users/${editingUserId}`, {
        email: editForm.email || undefined,
        fullName: editForm.fullName,
        phone: editForm.phone,
        isActive: editForm.isActive,
        roleIds: editForm.roleId ? [editForm.roleId] : [],
        branchId: editIsBranchManager && editForm.branchId ? editForm.branchId : undefined,
        companyIds: isEditRoleAdmin
          ? []
          : editRestrictedCompanyId
            ? [editRestrictedCompanyId]
            : editForm.companyIds,
        // Omitted entirely (not sent as an empty string) so the backend/offline mock only resets
        // the password when the admin actually typed a new one.
        password: editForm.password || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['sales-representatives'] });
      setEditingUserId(null);
      toast.success(t('userMgmt.userUpdated'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  // A focused, single-purpose alternative to resetting a password via the general edit modal —
  // same PATCH /users/:id endpoint (it already ignores every field but password when only
  // password is sent), just a dedicated action so an admin doesn't have to open the full edit
  // form to do this one thing.
  const resetPasswordMutation = useMutation({
    mutationFn: () => apiClient.patch(`/users/${passwordResetUser?.id}`, { password: passwordResetValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('userMgmt.passwordResetSuccess'));
      setPasswordResetUser(null);
      setPasswordResetValue('');
      setShowPasswordResetValue(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  function openPasswordReset(e: MouseEvent, user: User) {
    e.stopPropagation();
    setPasswordResetUser(user);
    setPasswordResetValue('');
    setShowPasswordResetValue(false);
  }

  function generateTempPassword() {
    // Not meant to be memorized — the admin hands it to the user once and (ideally) they change
    // it on first login via their own Account Settings. 12 chars covers upper/lower/digit/symbol.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    const bytes = new Uint32Array(12);
    crypto.getRandomValues(bytes);
    const generated = Array.from(bytes, (n) => chars[n % chars.length]).join('');
    setPasswordResetValue(generated);
    setShowPasswordResetValue(true);
  }

  function openEditUser(e: MouseEvent, user: User) {
    e.stopPropagation();
    setEditingUserId(user.id);
    setEditForm({
      email: user.email ?? '',
      fullName: user.fullName,
      phone: user.phone ?? '',
      password: '',
      roleId: user.roles[0]?.id ?? '',
      branchId: user.branchId ?? '',
      isActive: user.isActive,
      companyIds: user.companyIds ?? [],
    });
  }

  const userColumns: Column<User>[] = [
    { header: t('auth.phone'), accessor: (r) => r.phone },
    { header: t('common.name'), accessor: (r) => r.fullName },
    { header: t('auth.email'), accessor: (r) => r.email || '—' },
    { header: t('userMgmt.roles'), accessor: (r) => r.roles.map((role) => role.name).join(', ') || '—' },
    {
      // Passwords are one-way hashed server-side and never returned by the API — there is no
      // original value to reveal, so this always shows a fixed placeholder with no show/hide
      // toggle. Resetting a user's password is done from the edit modal instead.
      header: t('auth.password'),
      accessor: () => <span className="tracking-widest text-[var(--text-muted)]">••••••••</span>,
    },
    {
      header: t('common.status'),
      accessor: (r) => (
        <Badge color={r.isActive ? 'green' : 'gray'}>{r.isActive ? t('common.active') : t('common.inactive')}</Badge>
      ),
    },
    {
      header: t('common.actions'),
      accessor: (r) =>
        isProtectedAdmin(r.email) ? (
          <span className="text-xs text-[var(--text-muted)]">{t('userMgmt.systemAccount')}</span>
        ) : (
          <div className="flex justify-center gap-3">
            <button type="button" className="text-primary-600 hover:underline" onClick={(e) => openEditUser(e, r)}>
              {t('common.edit')}
            </button>
            <button
              type="button"
              className="text-amber-600 hover:underline"
              onClick={(e) => openPasswordReset(e, r)}
              title={t('userMgmt.resetPassword') ?? ''}
            >
              🔑 {t('userMgmt.resetPassword')}
            </button>
            <button
              type="button"
              className="text-red-600 hover:underline"
              onClick={(e) => handleDeleteUser(e, r)}
              disabled={deleteUserMutation.isPending}
            >
              {t('common.delete')}
            </button>
          </div>
        ),
      align: 'center',
    },
  ];

  const roleColumns: Column<Role>[] = [
    { header: t('common.name'), accessor: (r) => r.name },
    { header: t('table.systemRole'), accessor: (r) => (r.isSystemRole ? t('common.yes') : t('common.no')) },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.usersRoles')}
        actions={tab === 'users' ? <Button onClick={() => setModalOpen(true)}>+ {t('common.create')}</Button> : undefined}
      />

      <div className="mb-4 flex gap-2 text-sm">
        <button
          className={`rounded-lg px-3 py-1.5 ${tab === 'users' ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
          onClick={() => setTab('users')}
        >
          {t('userMgmt.users')}
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 ${tab === 'roles' ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
          onClick={() => setTab('roles')}
        >
          {t('userMgmt.roles')}
        </button>
      </div>

      {tab === 'users' ? (
        <DataTable columns={userColumns} data={usersQuery.data ?? []} keyField={(r) => r.id} isLoading={usersQuery.isLoading} />
      ) : (
        <DataTable columns={roleColumns} data={rolesQuery.data ?? []} keyField={(r) => r.id} isLoading={rolesQuery.isLoading} />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('common.create')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createUserMutation.mutate();
          }}
        >
          <FormField label={t('auth.phone')}>
            <Input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label={t('common.name')}>
            <Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </FormField>
          <FormField label={t('auth.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormField label={t('auth.password')}>
            <Input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.role')}>
            <Select
              value={form.roleId}
              onChange={(e) => {
                const nextRole = rolesQuery.data?.find((r) => r.id === e.target.value);
                setForm({
                  ...form,
                  roleId: e.target.value,
                  branchId: nextRole?.name === BRANCH_MANAGER_ROLE_NAME ? form.branchId : '',
                });
              }}
            >
              <option value="">—</option>
              {(rolesQuery.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </FormField>
          {createIsBranchManager && (
            <div className="col-span-2">
              <FormField label={t('userMgmt.branchManagerBranchLabel')}>
                <Select
                  required
                  value={form.branchId}
                  onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                >
                  <option value="">—</option>
                  {(branchesQuery.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameAr || b.nameEn}
                    </option>
                  ))}
                </Select>
              </FormField>
              {form.branchId && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t('userMgmt.roleRestrictedToBranch', { branch: createSelectedBranchName })}
                </p>
              )}
            </div>
          )}
          {isCreateRoleAdmin ? (
            <div className="col-span-2 text-xs text-[var(--text-muted)]">{t('userMgmt.adminAllCompanies')}</div>
          ) : createIsBranchManager ? null : createRestrictedCompanyId ? (
            <div className="col-span-2 text-xs text-[var(--text-muted)]">
              {t('userMgmt.roleRestrictedToCompany', { company: createRestrictedCompanyName })}
            </div>
          ) : (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                {t('userMgmt.accessibleCompanies')}
              </label>
              <div className="flex flex-wrap gap-3">
                {(companiesQuery.data ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.companyIds.includes(c.id)}
                      onChange={() => setForm({ ...form, companyIds: toggleCompany(form.companyIds, c.id) })}
                    />
                    {c.nameAr || c.nameEn}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createUserMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingUserId} onClose={() => setEditingUserId(null)} title={t('common.edit')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateUserMutation.mutate();
          }}
        >
          <FormField label={t('auth.phone')}>
            <Input
              type="tel"
              required
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
          </FormField>
          <FormField label={t('common.name')}>
            <Input
              required
              value={editForm.fullName}
              onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
            />
          </FormField>
          <FormField label={t('auth.email')}>
            <Input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label={t('userMgmt.newPasswordOptional')}>
              <Input
                type="password"
                minLength={8}
                placeholder={t('userMgmt.newPasswordHint') ?? ''}
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label={t('fields.role')}>
            <Select
              value={editForm.roleId}
              onChange={(e) => {
                const nextRole = rolesQuery.data?.find((r) => r.id === e.target.value);
                setEditForm({
                  ...editForm,
                  roleId: e.target.value,
                  branchId: nextRole?.name === BRANCH_MANAGER_ROLE_NAME ? editForm.branchId : '',
                });
              }}
            >
              <option value="">—</option>
              {(rolesQuery.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </FormField>
          {editIsBranchManager && (
            <div className="col-span-2">
              <FormField label={t('userMgmt.branchManagerBranchLabel')}>
                <Select
                  required
                  value={editForm.branchId}
                  onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}
                >
                  <option value="">—</option>
                  {(branchesQuery.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameAr || b.nameEn}
                    </option>
                  ))}
                </Select>
              </FormField>
              {editForm.branchId && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t('userMgmt.roleRestrictedToBranch', { branch: editSelectedBranchName })}
                </p>
              )}
            </div>
          )}
          <FormField label={t('common.status')}>
            <Select
              value={editForm.isActive ? '1' : '0'}
              onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === '1' })}
            >
              <option value="1">{t('common.active')}</option>
              <option value="0">{t('common.inactive')}</option>
            </Select>
          </FormField>
          {isEditRoleAdmin ? (
            <div className="col-span-2 text-xs text-[var(--text-muted)]">{t('userMgmt.adminAllCompanies')}</div>
          ) : editIsBranchManager ? null : editRestrictedCompanyId ? (
            <div className="col-span-2 text-xs text-[var(--text-muted)]">
              {t('userMgmt.roleRestrictedToCompany', { company: editRestrictedCompanyName })}
            </div>
          ) : (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                {t('userMgmt.accessibleCompanies')}
              </label>
              <div className="flex flex-wrap gap-3">
                {(companiesQuery.data ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={editForm.companyIds.includes(c.id)}
                      onChange={() => setEditForm({ ...editForm, companyIds: toggleCompany(editForm.companyIds, c.id) })}
                    />
                    {c.nameAr || c.nameEn}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingUserId(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={updateUserMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!passwordResetUser}
        onClose={() => {
          setPasswordResetUser(null);
          setPasswordResetValue('');
          setShowPasswordResetValue(false);
        }}
        title={t('userMgmt.resetPassword')}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            resetPasswordMutation.mutate();
          }}
        >
          <p className="text-sm text-[var(--text-muted)]">
            {t('userMgmt.resetPasswordFor', { name: passwordResetUser?.fullName ?? '' })}
          </p>
          <FormField label={t('userMgmt.newPassword')}>
            <div className="flex gap-2">
              <Input
                type={showPasswordResetValue ? 'text' : 'password'}
                required
                minLength={8}
                autoFocus
                value={passwordResetValue}
                onChange={(e) => setPasswordResetValue(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={() => setShowPasswordResetValue((v) => !v)}>
                {showPasswordResetValue ? t('userMgmt.hidePassword') : t('userMgmt.showPassword')}
              </Button>
            </div>
          </FormField>
          <Button type="button" variant="secondary" onClick={generateTempPassword}>
            {t('userMgmt.generateTempPassword')}
          </Button>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPasswordResetUser(null);
                setPasswordResetValue('');
                setShowPasswordResetValue(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={resetPasswordMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
