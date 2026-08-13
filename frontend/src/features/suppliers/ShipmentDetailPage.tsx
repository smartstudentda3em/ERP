import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdf } from '../../lib/pdf-export';

interface Company {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

interface ShippingExpenseType {
  id: string;
  nameEn: string;
}

interface ShipmentExpenseLine {
  id: string;
  amount: number;
  description: string | null;
  shippingExpenseTypeId: string;
  shippingExpenseType: { nameEn: string } | null;
}

interface ShipmentDetail {
  id: string;
  shipmentName: string;
  shipmentDate: string | null;
  shippingCompanyName: string;
  totalCost: number;
  expenses: ShipmentExpenseLine[];
}

function money(n: number): string {
  return formatAmount(n);
}

const emptyExpenseForm = { shippingExpenseTypeId: '', amount: '0', description: '' };

export function ShipmentDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyExpenseForm);

  const shipmentQuery = useQuery({
    queryKey: ['shipment', id],
    queryFn: () => unwrap<ShipmentDetail>(apiClient.get(`/imports/shipments/${id}`)),
    enabled: !!id,
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  const expenseTypesQuery = useQuery({
    queryKey: ['/imports/shipping-expense-types'],
    queryFn: () => unwrap<ShippingExpenseType[]>(apiClient.get('/imports/shipping-expense-types')),
    enabled: modalOpen,
  });

  // Every balance shown here (this shipment's total, its row in the shipments list) is a live SUM
  // over the expense lines, so invalidating both query keys after any expense write is the entire
  // sync step — the total can never drift from the ledger of actual line items.
  const invalidateShipmentQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['shipment', id] });
    queryClient.invalidateQueries({ queryKey: ['shipments'] });
  };

  const saveExpenseMutation = useMutation({
    mutationFn: () => {
      const payload = {
        shippingExpenseTypeId: form.shippingExpenseTypeId,
        amount: Number(form.amount),
        description: form.description || undefined,
      };
      return editingExpenseId
        ? apiClient.patch(`/imports/shipments/${id}/expenses/${editingExpenseId}`, payload)
        : apiClient.post(`/imports/shipments/${id}/expenses`, payload);
    },
    onSuccess: () => {
      invalidateShipmentQueries();
      setModalOpen(false);
      setEditingExpenseId(null);
      setForm(emptyExpenseForm);
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (expenseId: string) => apiClient.delete(`/imports/shipments/${id}/expenses/${expenseId}`),
    onSuccess: () => invalidateShipmentQueries(),
  });

  function openAddExpense() {
    setEditingExpenseId(null);
    setForm(emptyExpenseForm);
    setModalOpen(true);
  }

  function openEditExpense(row: ShipmentExpenseLine) {
    setEditingExpenseId(row.id);
    setForm({
      shippingExpenseTypeId: row.shippingExpenseTypeId,
      amount: String(row.amount),
      description: row.description ?? '',
    });
    setModalOpen(true);
  }

  async function handleDeleteExpense(row: ShipmentExpenseLine) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: row.shippingExpenseType?.nameEn ?? '' }) });
    if (ok) deleteExpenseMutation.mutate(row.id);
  }

  const shipment = shipmentQuery.data;
  const expenses = shipment?.expenses ?? [];

  const columns: Column<ShipmentExpenseLine>[] = [
    { header: t('imports.shippingExpenseType'), accessor: (r) => r.shippingExpenseType?.nameEn ?? '—' },
    { header: t('imports.expenseValue'), accessor: (r) => money(r.amount), align: 'right' },
    { header: t('table.description'), accessor: (r) => r.description ?? '—' },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button type="button" className="text-primary-600 hover:underline" onClick={() => openEditExpense(r)}>
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            disabled={deleteExpenseMutation.isPending}
            onClick={() => handleDeleteExpense(r)}
          >
            {t('common.delete')}
          </button>
        </div>
      ),
      align: 'center',
    },
  ];

  const printTitle = `${t('imports.shipmentDetails')} - ${shipment?.shipmentName ?? '—'}`;
  // "طلب استيراد - [شركة الشحن] - [اسم الشحنة].pdf" — this entity has no separate reference
  // number of its own, so shipmentName (e.g. "شحنة 7 / 2026") stands in for it, same as it already
  // does as this shipment's own identifying label everywhere else on this page.
  const printFileName = buildPdfFileName(
    'طلب استيراد',
    shipment?.shippingCompanyName,
    shipment?.shipmentName ?? 'shipment',
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
      toast.error(t('imports.pdfExportError'));
      // eslint-disable-next-line no-console
      console.error('Shipment detail PDF export failed:', err);
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={shipment?.shipmentName ?? t('imports.shipmentDetails')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePrint}>
              {t('common.print')}
            </Button>
            <Button variant="secondary" onClick={handleDownloadPdf} loading={pdfLoading}>
              {t('actions.downloadPdf')}
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex justify-end print:hidden">
        <Button onClick={openAddExpense}>+ {t('imports.addShipmentExpense')}</Button>
      </div>

      <div ref={printRef} className="shipment-print">
        <div className="shipment-print-header" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{company?.nameAr || company?.nameEn || '—'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, margin: '4px 0' }}>{printTitle}</div>
          <div style={{ fontSize: 11, color: '#4b5563' }}>
            {t('imports.printDate')}: {localToday()}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="sm:col-span-2">
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-[var(--text-muted)]">{t('imports.shipmentName')}</div>
                <div className="mt-1 font-medium">{shipment?.shipmentName ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">{t('imports.shipmentDate')}</div>
                <div className="mt-1 font-medium">{shipment?.shipmentDate ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">{t('imports.shippingCompany')}</div>
                <div className="mt-1 font-medium">{shipment?.shippingCompanyName ?? '—'}</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('imports.totalShipmentCost')}</div>
            <div className="mt-1 text-2xl font-bold text-primary-600">{money(shipment?.totalCost ?? 0)}</div>
          </Card>
        </div>

        {/* pageSize forced to the full array length so print/PDF captures every row, not just
            the current on-screen page. */}
        <DataTable
          columns={columns}
          data={expenses}
          keyField={(r) => r.id}
          isLoading={shipmentQuery.isLoading}
          searchable={false}
          pageSize={Math.max(expenses.length, 1)}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingExpenseId ? t('common.edit') : t('imports.addShipmentExpense')}
      >
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveExpenseMutation.mutate();
          }}
        >
          <FormField label={t('imports.shippingExpenseType')}>
            <Select
              required
              value={form.shippingExpenseTypeId}
              onChange={(e) => setForm({ ...form, shippingExpenseTypeId: e.target.value })}
            >
              <option value="">{t('imports.selectShippingExpenseType')}</option>
              {(expenseTypesQuery.data ?? []).map((et) => (
                <option key={et.id} value={et.id}>
                  {et.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('imports.expenseValue')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </FormField>
          <FormField label={t('table.description')}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveExpenseMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
