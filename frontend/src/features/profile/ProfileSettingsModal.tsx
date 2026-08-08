import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient, unwrap } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { FormField, Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';

interface OwnProfile {
  id: string;
  email?: string | null;
  fullName: string;
  phone: string;
}

/**
 * Self-service "Account Settings" — every logged-in user (any role, including the primary
 * Administrator) may edit their own phone/email and change their own password here. Deliberately
 * has no role/status field at all — those stay admin-only, edited from Users & Roles instead.
 */
export function ProfileSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const updateUser = useAuthStore((s) => s.updateUser);
  const clearSession = useAuthStore((s) => s.clearSession);

  const [form, setForm] = useState({ phone: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });

  const profileQuery = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => unwrap<OwnProfile>(apiClient.get('/users/me')),
    enabled: open,
  });

  useEffect(() => {
    if (profileQuery.data) {
      setForm({ phone: profileQuery.data.phone, email: profileQuery.data.email ?? '' });
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (!open) setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
  }, [open]);

  const profileMutation = useMutation({
    mutationFn: () => apiClient.patch('/users/me', { phone: form.phone, email: form.email || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      updateUser({ email: res.data.email, phone: res.data.phone });
      toast.success(t('profile.profileUpdated'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const passwordMutation = useMutation({
    mutationFn: () => {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error(t('profile.passwordMismatch') ?? 'Passwords do not match');
      }
      return apiClient
        .post('/auth/change-password', {
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        })
        .then((res) => res.data);
    },
    onSuccess: () => {
      toast.success(t('profile.passwordChanged'));
      // The backend revokes every active session on a successful password change — the current
      // access token is no longer backed by a valid session, so the only correct next step is to
      // sign the user back out and have them log in fresh with the new password.
      clearSession();
      navigate('/login');
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message ?? err?.message ?? t('common.saveFailed');
      toast.error(message);
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={t('profile.title')}>
      <div className="space-y-6">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            profileMutation.mutate();
          }}
        >
          <FormField label={t('profile.phone')}>
            <Input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </FormField>
          <FormField label={t('profile.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" disabled={profileMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>

        <div className="border-t border-[var(--border)] pt-4">
          <h3 className="mb-3 text-sm font-semibold">{t('profile.changePassword')}</h3>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              passwordMutation.mutate();
            }}
          >
            <FormField label={t('profile.oldPassword')}>
              <Input
                type="password"
                required
                minLength={1}
                value={passwordForm.oldPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
              />
            </FormField>
            <FormField label={t('profile.newPassword')}>
              <Input
                type="password"
                required
                minLength={8}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              />
            </FormField>
            <FormField label={t('profile.confirmPassword')}>
              <Input
                type="password"
                required
                minLength={8}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              />
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" disabled={passwordMutation.isPending}>
                {t('profile.changePassword')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
}
