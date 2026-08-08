import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, FormField } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';

interface BackupRecord {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  trigger: 'MANUAL' | 'SCHEDULED';
  uploadedToS3: boolean;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

// Same fixed-confirmation-code convention as FactoryResetTab.tsx's RESET_CODE — re-checked
// server-side in BackupsService.restoreBackup() before anything is overwritten; this client-side
// copy only decides when the button becomes clickable, it is NOT the real security boundary.
const RESTORE_CODE = '0145';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Manual backup trigger + list/download/restore/delete for saved backups. The actual pg_dump /
 * encryption / S3 upload / scheduled cron all run server-side (see backend/src/modules/backups);
 * this tab is purely the admin-facing control surface for it.
 */
export function BackupsTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');

  const backupsQuery = useQuery({
    queryKey: ['backups'],
    queryFn: () => unwrap<BackupRecord[]>(apiClient.get('/backups')),
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/backups'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success(t('backups.createSuccess'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('backups.createError')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/backups/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  });

  const restoreMutation = useMutation({
    mutationFn: () => apiClient.post(`/backups/${restoreTarget!.id}/restore`, { confirmationCode }),
    onSuccess: () => {
      setRestoreTarget(null);
      setConfirmationCode('');
      toast.success(t('backups.restoreSuccess'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('backups.restoreError')),
  });

  async function handleDownload(record: BackupRecord) {
    try {
      const response = await apiClient.get(`/backups/${record.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = record.fileName.replace(/\.enc$/, '');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t('backups.downloadError'));
    }
  }

  function statusBadge(record: BackupRecord) {
    if (record.status === 'SUCCESS') return <Badge color="green">{t('backups.status.SUCCESS')}</Badge>;
    if (record.status === 'FAILED')
      return (
        <Badge color="red" title={record.errorMessage ?? undefined}>
          {t('backups.status.FAILED')}
        </Badge>
      );
    return <Badge color="yellow">{t('backups.status.RUNNING')}</Badge>;
  }

  const columns: Column<BackupRecord>[] = [
    { header: t('backups.fileName'), accessor: (r) => r.fileName },
    { header: t('backups.createdAt'), accessor: (r) => new Date(r.createdAt).toLocaleString() },
    { header: t('backups.trigger'), accessor: (r) => t(`backups.triggerType.${r.trigger}`) },
    { header: t('backups.size'), accessor: (r) => (r.status === 'SUCCESS' ? formatSize(r.sizeBytes) : '—'), align: 'right' },
    { header: t('backups.uploadedToS3'), accessor: (r) => (r.uploadedToS3 ? t('common.yes') : t('common.no')) },
    { header: t('common.status'), accessor: statusBadge },
    {
      header: t('common.actions'),
      accessor: (r) =>
        r.status === 'SUCCESS' ? (
          <div className="flex justify-center gap-3">
            <button type="button" className="text-primary-600 hover:underline" onClick={() => handleDownload(r)}>
              {t('backups.download')}
            </button>
            <button
              type="button"
              className="text-orange-600 hover:underline"
              onClick={() => {
                setRestoreTarget(r);
                setConfirmationCode('');
              }}
            >
              {t('backups.restore')}
            </button>
            <button
              type="button"
              className="text-red-600 hover:underline"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                const ok = await confirm({ message: t('common.confirmDelete', { name: r.fileName }) });
                if (ok) deleteMutation.mutate(r.id);
              }}
            >
              {t('common.delete')}
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              className="text-red-600 hover:underline"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(r.id)}
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
      <Card className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">{t('backups.manualBackupTitle')}</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{t('backups.manualBackupHint')}</p>
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? t('backups.creating') : t('backups.createButton')}
          </Button>
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={backupsQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={backupsQuery.isLoading}
        searchable={false}
      />

      <Modal open={!!restoreTarget} onClose={() => setRestoreTarget(null)} title={t('backups.restoreConfirmTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-red-600 dark:text-red-400">{t('backups.restoreWarning', { fileName: restoreTarget?.fileName })}</p>
          <FormField label={t('backups.confirmationCodeLabel')}>
            <Input
              type="password"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRestoreTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-red-600 bg-red-600 text-white hover:bg-red-700"
              disabled={confirmationCode !== RESTORE_CODE || restoreMutation.isPending}
              onClick={() => restoreMutation.mutate()}
            >
              {restoreMutation.isPending ? t('backups.restoring') : t('backups.restoreConfirmButton')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
