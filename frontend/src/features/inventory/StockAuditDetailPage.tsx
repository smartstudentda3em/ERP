import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { FormField, Input, Select } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { localToday, monthKeyOf, monthNameOf, monthNameOnly, yearKeyOf } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdf } from '../../lib/pdf-export';
import { formatAmount } from '../../lib/number-format';

interface AuditLine {
  id: string;
  productId: string;
  systemQuantity: number;
  actualQuantity: number | null;
  adjustedQuantity: number | null;
  unitCost: number;
  product: { nameEn: string };
}

interface AuditDetail {
  id: string;
  documentNumber: string;
  auditDate: string;
  status: 'CONFIRMED' | 'APPROVED';
  notes?: string | null;
  createdByName?: string;
  createdAt: string;
  approvedByName?: string;
  approvedAt?: string | null;
  warehouse: { nameEn: string; nameAr?: string | null; branch?: { nameEn: string; nameAr?: string | null } | null } | null;
  lines: AuditLine[];
}

const AUDIT_STATUS_COLOR: Record<string, 'gray' | 'green' | 'yellow'> = {
  CONFIRMED: 'yellow',
  APPROVED: 'green',
};

export function StockAuditDetailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canApprove = useAuthStore((s) => s.hasPermission('inventory.stockAudit.approve'));
  const canEdit = useAuthStore((s) => s.hasPermission('inventory.stockAudit.edit'));
  const { company, isPrintingPress } = useActiveCompany();
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const now = new Date();
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, notes: '' });
  const [editActuals, setEditActuals] = useState<Record<string, string>>({});
  // Admin-only override of each line's final approved quantity ("كمية المخزون الجديدة"), entered
  // while reviewing a pending (CONFIRMED) audit — keyed by productId, defaults to actualQuantity
  // whenever untouched. Submitted alongside the approve request; see approveMutation below.
  const [adjustedValues, setAdjustedValues] = useState<Record<string, string>>({});

  const detailQuery = useQuery({
    queryKey: ['stock-audit', id],
    queryFn: () => unwrap<AuditDetail>(apiClient.get(`/inventory/stock-audits/${id}`)),
    enabled: !!id,
  });

  function invalidateAfterStockChange() {
    queryClient.invalidateQueries({ queryKey: ['stock-audit', id] });
    queryClient.invalidateQueries({ queryKey: ['stock-audits'] });
    queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-summary'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-products'] });
  }

  const approveMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/inventory/stock-audits/${id}/approve`, {
        lines: (detailQuery.data?.lines ?? [])
          .filter((l) => l.actualQuantity !== null)
          .map((l) => {
            const raw = adjustedValues[l.productId];
            return {
              productId: l.productId,
              adjustedQuantity: raw === undefined || raw.trim() === '' ? l.actualQuantity : Number(raw),
            };
          }),
      }),
    onSuccess: () => {
      invalidateAfterStockChange();
      setAdjustedValues({});
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  // Edits the counted quantities (and month/notes) of an audit regardless of status — for an
  // already-APPROVED one, the backend reverses its originally-applied stock effect and reapplies
  // a fresh adjustment for the new counts (see StockAuditsService.update()), so this needs the
  // exact same broad invalidation as approving/deleting one.
  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/inventory/stock-audits/${id}`, {
        auditDate: isPrintingPress
          ? `${editForm.year}-${String(editForm.month).padStart(2, '0')}-01`
          : `${editForm.year}-01-01`,
        notes: editForm.notes || undefined,
        lines: (detailQuery.data?.lines ?? []).map((l) => ({
          productId: l.productId,
          actualQuantity: (editActuals[l.productId] ?? '').trim() === '' ? null : Number(editActuals[l.productId]),
        })),
      }),
    onSuccess: () => {
      invalidateAfterStockChange();
      setEditMode(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  function startEdit() {
    if (!detailQuery.data) return;
    const key = monthKeyOf(detailQuery.data.auditDate);
    const [yearStr, monthStr] = key.split('-');
    setEditForm({ year: Number(yearStr), month: Number(monthStr), notes: detailQuery.data.notes ?? '' });
    setEditActuals(
      Object.fromEntries(detailQuery.data.lines.map((l) => [l.productId, l.actualQuantity === null ? '' : String(l.actualQuantity)])),
    );
    setEditMode(true);
  }

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <div>
        <PageHeader title={t('stockAudit.auditDetails')} />
        <p className="text-sm text-[var(--text-muted)]">{t('common.loading')}</p>
      </div>
    );
  }

  const audit = detailQuery.data;

  const varianceOf = (l: AuditLine): number | null => {
    if (!editMode) return l.actualQuantity === null ? null : l.actualQuantity - l.systemQuantity;
    const raw = editActuals[l.productId] ?? '';
    return raw.trim() === '' ? null : Number(raw) - l.systemQuantity;
  };

  // "كمية المخزون الجديدة" — the final quantity that will actually be written to stock. Before
  // approval this is the admin's live-editable override (defaulting to actualQuantity); after
  // approval it's the persisted, locked value the approve request actually applied.
  const newStockQuantityOf = (l: AuditLine): number | null => {
    if (l.actualQuantity === null) return null;
    if (audit.status === 'APPROVED') return l.adjustedQuantity ?? l.actualQuantity;
    const raw = adjustedValues[l.productId];
    return raw === undefined || raw.trim() === '' ? l.actualQuantity : Number(raw);
  };

  // "الكمية المستهلكة" = الكمية النظامية - كمية المخزون الجديدة، محسوبة ديناميكياً.
  const consumedQuantityOf = (l: AuditLine): number | null => {
    const newQuantity = newStockQuantityOf(l);
    return newQuantity === null ? null : l.systemQuantity - newQuantity;
  };

  // "السعر الإجمالي" = الكمية المستهلكة × سعر الوحدة (unitCost، مسحوب تلقائياً من بيانات المنتج).
  const totalPriceOf = (l: AuditLine): number | null => {
    const consumed = consumedQuantityOf(l);
    return consumed === null ? null : consumed * Number(l.unitCost);
  };

  // "إجمالي المستهلك" — مجموع عمود السعر الإجمالي لكافة الأصناف، محسوب حياً بنفس منطق الجدول.
  const totalConsumedValue = audit.lines.reduce((sum, l) => sum + (totalPriceOf(l) ?? 0), 0);

  // Only meaningful once an admin has actually started (or finished) reviewing a submitted audit —
  // shown editable to the approver on a pending audit, and locked/read-only to everyone once
  // approved. Hidden during the separate, pre-existing "تعديل" (canEdit) count-editing mode, since
  // showing a second set of quantity inputs at the same time would be confusing.
  const showReviewColumns = !editMode && (audit.status === 'APPROVED' || (audit.status === 'CONFIRMED' && canApprove));
  const canEditReview = !editMode && audit.status === 'CONFIRMED' && canApprove;

  const columns: Column<AuditLine>[] = [
    { header: t('fields.product'), accessor: (r) => r.product?.nameEn },
    { header: t('stockAudit.systemQuantity'), accessor: (r) => formatAmount(r.systemQuantity), align: 'right' },
    {
      header: t('stockAudit.actualQuantity'),
      accessor: (r) =>
        editMode ? (
          <Input
            type="number"
            step="0.0001"
            value={editActuals[r.productId] ?? ''}
            onChange={(e) => setEditActuals((prev) => ({ ...prev, [r.productId]: e.target.value }))}
            className="w-28"
          />
        ) : (
          r.actualQuantity === null ? '—' : formatAmount(r.actualQuantity)
        ),
      align: 'center',
    },
    {
      header: t('stockAudit.variance'),
      accessor: (r) => {
        const v = varianceOf(r);
        if (v === null) return '—';
        const color = v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : 'text-[var(--text-muted)]';
        return <span className={color}>{v > 0 ? `+${formatAmount(v)}` : formatAmount(v)}</span>;
      },
      align: 'right',
    },
    {
      header: t('stockAudit.lineStatus'),
      accessor: (r) => {
        const v = varianceOf(r);
        if (v === null) return <Badge color="gray">{t('stockAudit.pendingCount')}</Badge>;
        return (
          <Badge color={v === 0 ? 'green' : v > 0 ? 'blue' : 'red'}>
            {v === 0 ? t('stockAudit.matched') : v > 0 ? t('stockAudit.surplus') : t('stockAudit.shortage')}
          </Badge>
        );
      },
      align: 'center',
    },
    ...(showReviewColumns
      ? [
          {
            header: t('stockAudit.newStockQuantity'),
            accessor: (r: AuditLine) => {
              if (r.actualQuantity === null) return '—';
              if (canEditReview) {
                return (
                  <Input
                    type="number"
                    step="0.0001"
                    value={adjustedValues[r.productId] ?? String(r.actualQuantity)}
                    onChange={(e) => setAdjustedValues((prev) => ({ ...prev, [r.productId]: e.target.value }))}
                    className="w-28"
                  />
                );
              }
              return newStockQuantityOf(r);
            },
            align: 'center' as const,
          },
          {
            header: t('stockAudit.consumedQuantity'),
            accessor: (r: AuditLine) => {
              const c = consumedQuantityOf(r);
              return c === null ? '—' : c;
            },
            align: 'right' as const,
          },
          {
            header: t('stockAudit.unitPrice'),
            accessor: (r: AuditLine) => formatAmount(r.unitCost),
            align: 'right' as const,
          },
          {
            header: t('stockAudit.totalPrice'),
            accessor: (r: AuditLine) => {
              const total = totalPriceOf(r);
              return total === null ? '—' : formatAmount(total);
            },
            align: 'right' as const,
          },
        ]
      : []),
  ];

  // A descriptive "الجرد الشهري - <month> <year>" (Press) / "الجرد السنوي - <year>"
  // (Stationery/Air Conditioning) heading reads better than the auto-generated AUDIT-000001
  // document number, which stays available in the print header via documentNumber if needed.
  const printTitle = isPrintingPress
    ? t('stockAudit.auditDetailsTitle', { month: monthNameOf(monthKeyOf(audit.auditDate), i18n.language) })
    : t('stockAudit.auditDetailsTitleAnnual', { year: yearKeyOf(audit.auditDate) });
  const printFileName = buildPdfFileName(
    t(isPrintingPress ? 'nav.stockAudit' : 'nav.stockAuditAnnual'),
    audit.warehouse?.nameEn,
    audit.documentNumber,
  );

  function handlePrint() {
    const previousTitle = document.title;
    document.title = printTitle;
    window.print();
    document.title = previousTitle;
  }

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    // Toggled just before the html2canvas snapshot so the print-only header (normally
    // display:none on screen) renders into the capture — html2canvas reads the live DOM's regular
    // stylesheet, not @media print, so a plain class toggle is what actually shows it.
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      await exportElementToPdf(printRef.current, printFileName, 'portrait');
    } catch (err) {
      toast.error(t('stockAudit.pdfExportError'));
      // eslint-disable-next-line no-console
      console.error('Stock audit detail PDF export failed:', err);
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={printTitle}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="secondary" onClick={handlePrint}>
              {t('common.print')}
            </Button>
            <Button variant="secondary" onClick={handleDownloadPdf} loading={pdfLoading}>
              {t('actions.downloadPdf')}
            </Button>
            {canEdit && !editMode && <Button onClick={startEdit}>{t('common.edit')}</Button>}
          </div>
        }
      />
      {/* إجمالي المستهلك ممركز تماماً في نفس الصف الأفقي لرابط "العودة إلى القائمة" — عمود ثالث
          فارغ يوازن الشبكة (grid-cols-3) بحيث تبقى الكارت في منتصف الصفحة الحقيقي، لا فقط منتصف
          المساحة المتبقية بجانب الزر. */}
      <div className="mb-3 grid grid-cols-3 items-center print:hidden">
        <Button variant="secondary" onClick={() => navigate('/inventory/stock-audit')} className="justify-self-start">
          {t('stockAudit.backToList')}
        </Button>
        <div className="flex items-center gap-2 justify-self-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm">
          <span className="text-[var(--text-muted)]">{t('stockAudit.totalConsumedValue')}</span>
          <span className="font-semibold">{formatAmount(totalConsumedValue)}</span>
        </div>
      </div>

      {editMode && (
        <Card className="mb-4 print:hidden">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {isPrintingPress && (
              <FormField label={t('stockAudit.auditMonth')}>
                <Select
                  value={editForm.month}
                  onChange={(e) => setEditForm({ ...editForm, month: Number(e.target.value) })}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {monthNameOnly(m, i18n.language)}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField label={t(isPrintingPress ? 'common.year' : 'stockAudit.auditYear')}>
              <Input
                type="number"
                value={editForm.year}
                onChange={(e) => setEditForm({ ...editForm, year: Number(e.target.value) || now.getFullYear() })}
              />
            </FormField>
            <FormField label={t('common.notes')}>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </FormField>
          </div>
        </Card>
      )}

      <div ref={printRef} className="stock-audit-print">
        <div className="stock-audit-print-header">
          <div style={{ fontSize: 16, fontWeight: 800 }}>{company?.nameAr || company?.nameEn || '—'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{printTitle}</div>
          <div style={{ fontSize: 11, color: '#4b5563' }}>
            {t('imports.printDate')}: {localToday()}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('fields.branch')}</div>
            <div className="mt-1 font-semibold">{audit.warehouse?.branch?.nameAr || audit.warehouse?.branch?.nameEn || '—'}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('fields.warehouse')}</div>
            <div className="mt-1 font-semibold">{audit.warehouse?.nameAr || audit.warehouse?.nameEn || '—'}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('stockAudit.countedBy')}</div>
            <div className="mt-1 font-semibold">{audit.createdByName ?? '—'}</div>
            <div className="text-xs text-[var(--text-muted)]">{new Date(audit.createdAt).toLocaleString()}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('common.status')}</div>
            <div className="mt-1">
              <Badge color={AUDIT_STATUS_COLOR[audit.status]}>
                {t(`stockAudit.documentStatus.${audit.status}`, audit.status)}
              </Badge>
            </div>
            {audit.status === 'APPROVED' && (
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                {t('stockAudit.approvedBy')} {audit.approvedByName ?? '—'} -{' '}
                {audit.approvedAt ? new Date(audit.approvedAt).toLocaleString() : ''}
              </div>
            )}
          </Card>
        </div>

        {/* pageSize forced to the full array length so print/PDF captures every row, not just
            the current on-screen page. */}
        <DataTable
          columns={columns}
          data={audit.lines}
          keyField={(r) => r.id}
          searchable={false}
          pageSize={Math.max(audit.lines.length, 1)}
        />
      </div>

      {editMode ? (
        <div className="mt-4 flex justify-end gap-2 print:hidden">
          <Button variant="secondary" onClick={() => setEditMode(false)} disabled={updateMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {t('common.save')}
          </Button>
        </div>
      ) : (
        audit.status === 'CONFIRMED' &&
        canApprove && (
          <div className="mt-4 flex justify-end print:hidden">
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {t('stockAudit.approveAction')}
            </Button>
          </div>
        )
      )}
    </div>
  );
}
