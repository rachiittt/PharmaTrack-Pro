import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Settings2 } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { stockAlerts } from '../services/insights';
import { money, date, number } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { Button } from '../components/ui/Button';
import { DataTable } from '../components/ui/DataTable';
import { ExpiryBar, PageHeader, Segmented } from '../components/ui/Misc';
import { EmptyState, ErrorState } from '../components/ui/States';
import { AdjustStockModal } from '../components/inventory/AdjustStockModal';

const TABS = [
  { value: 'expired', label: 'Expired', key: 'expired', tone: 'danger' },
  { value: 'expiring', label: 'Expiring', keys: ['expiring_critical', 'expiring_warning'], tone: 'warning' },
  { value: 'out', label: 'Out of stock', key: 'out_of_stock', tone: 'danger' },
  { value: 'low', label: 'Low stock', key: 'low_stock', tone: 'warning' },
  { value: 'slow', label: 'Slow moving', key: 'slow_moving', tone: 'caution' },
  { value: 'dead', label: 'Dead stock', key: 'dead_stock', tone: 'caution' },
];

const EXPLAIN = {
  expired: 'Batches past their expiry date that still have units. They are never billed — remove them from the shelf and write them off.',
  expiring: (t) => `Batches expiring within ${t.warning_days} days (red within ${t.critical_days}). Sell first, return to the supplier, or discount where allowed.`,
  out: 'Products with no sellable stock in this branch.',
  low: 'Products at or below their minimum stock level.',
  slow: (t) => `In stock but not sold for over ${t.slow_moving_days} days.`,
  dead: (t) => `In stock but not sold for over ${t.dead_stock_days} days — money tied up on the shelf.`,
};

export default function Alerts() {
  const { pharmacy, branch, can } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'expired';
  const [writeOff, setWriteOff] = useState(null);
  const { data, error, loading, reload } = useAsync(() => stockAlerts(pharmacy.id, branch?.id ?? null), [pharmacy.id, branch?.id]);

  const rowsFor = (t) => (t.keys ? t.keys.flatMap((k) => data?.[k] ?? []) : data?.[t.key] ?? []);
  const active = TABS.find((t) => t.value === tab);
  const rows = data ? rowsFor(active) : undefined;
  const th = data?.thresholds ?? {};
  const explain = typeof EXPLAIN[tab] === 'function' ? EXPLAIN[tab](th) : EXPLAIN[tab];
  const isBatch = tab === 'expired' || tab === 'expiring';
  const totalValue = (rows || []).reduce((s, r) => s + Number(r.value_at_cost || 0), 0);

  const batchColumns = [
    { key: 'name', header: 'Product', render: (r) => <Link to={`/inventory/${r.product_id}`} className="font-medium hover:underline">{r.name}</Link> },
    { key: 'batch_no', header: 'Batch', render: (r) => <span className="code">{r.batch_no}</span> },
    { key: 'expiry', header: 'Expiry', render: (r) => <ExpiryBar date={r.expiry_date} criticalDays={th.critical_days} warningDays={th.warning_days} /> },
    { key: 'quantity', header: 'Units', align: 'right', render: (r) => r.quantity },
    { key: 'value', header: 'Value (cost)', align: 'right', hideBelow: 'sm', render: (r) => money(r.value_at_cost) },
    { key: 'rack', header: 'Rack', hideBelow: 'md', render: (r) => <span className="code text-ink-2">{r.rack_location || '—'}</span> },
    ...(tab === 'expired' && can('stock.adjust') ? [{ key: 'act', header: '', render: (r) => (
      <Button size="xs" variant="danger-outline" onClick={() => setWriteOff(r)}>Write off</Button>
    ) }] : []),
  ];
  const productColumns = [
    { key: 'name', header: 'Product', render: (r) => <Link to={`/inventory/${r.product_id}`} className="font-medium hover:underline">{r.name}<span className="block text-xs font-normal text-ink-3">{r.generic_name}</span></Link> },
    { key: 'qty', header: 'Sellable', align: 'right', render: (r) => <span className={r.sellable_qty === 0 ? 'text-danger' : ''}>{r.sellable_qty}</span> },
    { key: 'min', header: 'Minimum', align: 'right', hideBelow: 'sm', render: (r) => r.min_stock_level },
    ...(tab === 'slow' || tab === 'dead'
      ? [{ key: 'value', header: 'Value (cost)', align: 'right', render: (r) => money(r.value_at_cost) },
        { key: 'last', header: 'Last sold', hideBelow: 'sm', render: (r) => (r.last_sold_at ? date(r.last_sold_at) : 'Never') }]
      : [{ key: 'supplier', header: 'Usual supplier', hideBelow: 'md', render: (r) => r.supplier_name || '—' }]),
    ...(can('purchases.create') && (tab === 'low' || tab === 'out') ? [{ key: 'act', header: '', render: (r) => (
      <Button size="xs" variant="ghost" icon={ClipboardList} onClick={() => navigate(`/purchases/new?product=${r.product_id}`)}>Reorder</Button>
    ) }] : []),
  ];

  function exportTab() {
    downloadCsv(`alerts-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, rows || [], isBatch
      ? [{ label: 'Product', value: 'name' }, { label: 'Batch', value: 'batch_no' }, { label: 'Expiry', value: 'expiry_date' }, { label: 'Days left', value: 'days_left' }, { label: 'Units', value: 'quantity' }, { label: 'Value at cost', value: 'value_at_cost' }, { label: 'Rack', value: 'rack_location' }]
      : [{ label: 'Product', value: 'name' }, { label: 'Generic', value: 'generic_name' }, { label: 'Sellable', value: 'sellable_qty' }, { label: 'Minimum', value: 'min_stock_level' }, { label: 'Supplier', value: 'supplier_name' }, { label: 'Value at cost', value: 'value_at_cost' }, { label: 'Last sold', value: 'last_sold_at' }]);
  }

  return (
    <>
      <PageHeader title="Expiry & stock alerts" description={`Thresholds come from your settings${branch ? ` · ${branch.name}` : ''}`}
        actions={(
          <>
            <Button variant="secondary" onClick={exportTab} disabled={!rows?.length}>Export</Button>
            {can('settings.pharmacy') && <Button variant="secondary" icon={Settings2} onClick={() => navigate('/settings#alerts')}>Thresholds</Button>}
          </>
        )} />
      <Segmented className="mb-3" value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={TABS.map((t) => ({ value: t.value, label: t.label, count: data ? rowsFor(t).length : undefined, tone: t.tone }))} />
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm">
          <p className="text-ink-2">{explain}</p>
          {rows?.length > 0 && totalValue > 0 && <p className="text-ink-3">{number(rows.length)} rows · <span className="num font-medium text-ink">{money(totalValue)}</span> at cost</p>}
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : (
          <DataTable loading={loading} rows={rows} rowKey={(r) => r.id || r.product_id} columns={isBatch ? batchColumns : productColumns}
            empty={<EmptyState icon={CheckCircle2} title="Nothing here">No items match this alert right now.</EmptyState>} />
        )}
      </div>
      {writeOff && (
        <AdjustStockModal batch={{ id: writeOff.id, batch_no: writeOff.batch_no, expiry_date: writeOff.expiry_date, quantity: writeOff.quantity }}
          productName={writeOff.name} defaultType="expired_writeoff" onClose={() => setWriteOff(null)} onDone={reload} />
      )}
    </>
  );
}
