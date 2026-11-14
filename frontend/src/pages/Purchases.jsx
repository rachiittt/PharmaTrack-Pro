import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { listPurchases } from '../services/purchases';
import { listSuppliers } from '../services/suppliers';
import { money, date, todayIso } from '../lib/format';
import { Button } from '../components/ui/Button';
import { BareSelect } from '../components/ui/Field';
import { DataTable, Pagination } from '../components/ui/DataTable';
import { PageHeader, Segmented } from '../components/ui/Misc';
import { PaymentStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState } from '../components/ui/States';

const PAGE = 25;

export default function Purchases() {
  const { pharmacy, can } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') || '');
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);
  const suppliers = useAsync(() => listSuppliers(pharmacy.id), [pharmacy.id]);
  const { data, error, loading, reload } = useAsync(
    () => listPurchases({ pharmacyId: pharmacy.id, supplierId: supplierId || null, status: status || null, page, pageSize: PAGE }),
    [pharmacy.id, supplierId, status, page],
  );
  const today = todayIso();

  return (
    <>
      <PageHeader title="Purchases" description="Supplier invoices received into stock"
        actions={can('purchases.create') && <Button icon={Plus} onClick={() => navigate('/purchases/new')}>Receive stock</Button>} />
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center">
          <Segmented value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            options={[{ value: '', label: 'All' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Part paid' }, { value: 'paid', label: 'Paid' }]} />
          <BareSelect value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPage(1); }} aria-label="Supplier" className="sm:ml-auto sm:w-60"
            options={[{ value: '', label: 'All suppliers' }, ...(suppliers.data || []).map((s) => ({ value: s.id, label: s.name }))]} />
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <DataTable
              loading={loading}
              rows={data?.rows}
              onRowClick={(r) => navigate(`/purchases/${r.id}`)}
              columns={[
                { key: 'invoice_date', header: 'Date', render: (r) => <span className="whitespace-nowrap">{date(r.invoice_date)}</span> },
                { key: 'supplier', header: 'Supplier', render: (r) => <span className="font-medium">{r.suppliers?.name}</span> },
                { key: 'supplier_invoice_no', header: 'Invoice', render: (r) => <span className="code">{r.supplier_invoice_no}</span> },
                { key: 'reference_no', header: 'GRN', hideBelow: 'lg', render: (r) => <span className="code text-ink-3">{r.reference_no}</span> },
                { key: 'total', header: 'Total', align: 'right', render: (r) => money(r.total_amount) },
                { key: 'due', header: 'Outstanding', align: 'right', hideBelow: 'sm', render: (r) => (Number(r.total_amount) - Number(r.amount_paid) > 0 ? money(Number(r.total_amount) - Number(r.amount_paid)) : '—') },
                { key: 'due_date', header: 'Due', hideBelow: 'md', render: (r) => (r.payment_status === 'paid' ? '—' : <span className={r.due_date < today ? 'text-danger' : ''}>{date(r.due_date)}</span>) },
                { key: 'status', header: 'Status', render: (r) => <PaymentStatusBadge status={r.payment_status} overdue={r.due_date && r.due_date < today} /> },
              ]}
              empty={(
                <EmptyState icon={ClipboardList} title="No purchases recorded"
                  action={can('purchases.create') && <Button icon={Plus} onClick={() => navigate('/purchases/new')}>Receive stock</Button>}>
                  Enter supplier invoices here to add batches to stock and track what you owe.
                </EmptyState>
              )}
            />
            <Pagination page={page} pageSize={PAGE} total={data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
