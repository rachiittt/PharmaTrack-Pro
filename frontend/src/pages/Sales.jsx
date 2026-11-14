import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Search } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync, useDebounced } from '../hooks/useAsync';
import { listSales, PAYMENT_METHODS } from '../services/sales';
import { money, dateTime, daysAgoIso, todayIso } from '../lib/format';
import { BareInput, BareSelect } from '../components/ui/Field';
import { DataTable, Pagination } from '../components/ui/DataTable';
import { PageHeader } from '../components/ui/Misc';
import { SaleStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState } from '../components/ui/States';

const PAGE = 25;

export default function Sales() {
  const { pharmacy, branch, role } = useSession();
  const navigate = useNavigate();
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 300);
  const { data, error, loading, reload } = useAsync(
    () => listSales({ pharmacyId: pharmacy.id, branchId: branch?.id, from, to, status, paymentMethod: method, search: q, page, pageSize: PAGE }),
    [pharmacy.id, branch?.id, from, to, status, method, q, page],
  );
  const reset = (fn) => (e) => { fn(e.target.value); setPage(1); };

  return (
    <>
      <PageHeader title="Sales & returns" description={role === 'cashier' ? 'Bills you created' : `All bills${branch ? ` at ${branch.name}` : ''}`} />
      <div className="rounded-xl border border-line bg-surface">
        <div className="grid gap-3 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <BareInput value={search} onChange={reset(setSearch)} placeholder="Invoice no., customer name or mobile" className="pl-9" aria-label="Search sales" />
          </div>
          <BareInput type="date" value={from} max={to} onChange={reset(setFrom)} aria-label="From date" />
          <BareInput type="date" value={to} min={from} max={todayIso()} onChange={reset(setTo)} aria-label="To date" />
          <BareSelect value={status} onChange={reset(setStatus)} aria-label="Status" options={[
            { value: '', label: 'Any status' }, { value: 'completed', label: 'Completed' }, { value: 'partially_returned', label: 'Part returned' },
            { value: 'returned', label: 'Returned' }, { value: 'cancelled', label: 'Cancelled' },
          ]} />
          <BareSelect value={method} onChange={reset(setMethod)} aria-label="Payment" options={[{ value: '', label: 'Any payment' }, ...PAYMENT_METHODS]} />
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <DataTable
              loading={loading}
              rows={data?.rows}
              onRowClick={(s) => navigate(`/sales/${s.id}`)}
              rowClassName={(s) => (s.status === 'cancelled' ? 'text-ink-3' : '')}
              columns={[
                { key: 'invoice_no', header: 'Invoice', render: (s) => <span className="code font-medium">{s.invoice_no}</span> },
                { key: 'created_at', header: 'Date', render: (s) => <span className="whitespace-nowrap">{dateTime(s.created_at)}</span> },
                { key: 'customer', header: 'Customer', hideBelow: 'sm', render: (s) => s.customer_name || <span className="text-ink-3">Walk-in</span> },
                { key: 'by', header: 'Billed by', hideBelow: 'lg', render: (s) => s.profiles?.full_name || '—' },
                { key: 'method', header: 'Paid by', hideBelow: 'md', render: (s) => PAYMENT_METHODS.find((m) => m.value === s.payment_method)?.label },
                { key: 'status', header: 'Status', render: (s) => <SaleStatusBadge status={s.status} /> },
                { key: 'total', header: 'Total', align: 'right', render: (s) => (
                  <span className={s.status === 'cancelled' ? 'line-through' : 'font-medium'}>{money(s.total_amount)}
                    {Number(s.refunded_amount) > 0 && s.status !== 'cancelled' && <span className="block text-xs font-normal text-danger">−{money(s.refunded_amount)}</span>}
                  </span>
                ) },
              ]}
              empty={<EmptyState icon={Receipt} title="No bills in this range">Change the dates or filters, or create a bill from the POS.</EmptyState>}
            />
            <Pagination page={page} pageSize={PAGE} total={data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
