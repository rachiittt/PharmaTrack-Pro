import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Boxes, ClipboardList, PackageX, Plus, ShoppingCart, Wallet } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { dashboardSummary } from '../services/insights';
import { money, moneyCompact, number, pctChange, dateTime, date } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { PageHeader, Segmented, Stat } from '../components/ui/Misc';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { SaleStatusBadge } from '../components/ui/Badge';

const PERIODS = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }];
const METHOD = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit' };

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <div className="font-medium text-ink">{date(p.date, { weekday: 'short', day: '2-digit', month: 'short' })}</div>
      <div className="num text-ink-2">{money(p.revenue)} · {p.bills} bills</div>
    </div>
  );
}

export default function Dashboard() {
  const { pharmacy, branch, profile, can } = useSession();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const { data: d, error, loading, reload } = useAsync(() => dashboardSummary(pharmacy.id, branch?.id ?? null, days), [pharmacy.id, branch?.id, days]);

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const header = (
    <PageHeader
      title={`${greeting}${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`}
      description={`${pharmacy.name}${branch ? ` · ${branch.name}` : ''}`}
      actions={(
        <>
          {can('purchases.create') && <Button variant="secondary" icon={ClipboardList} onClick={() => navigate('/purchases/new')}>Receive stock</Button>}
          <Button icon={ShoppingCart} onClick={() => navigate('/pos')}>New bill</Button>
        </>
      )}
    />
  );

  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>;
  if (!d) {
    return (
      <>{header}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}</div>
        <Skeleton className="mt-4 h-[300px] rounded-xl" />
      </>
    );
  }

  const s = d.stock;
  const emptyCatalogue = s.products === 0;
  const trend = pctChange(d.period.revenue, d.period.previous_revenue);
  const margin = Number(d.period.revenue) > 0 ? (Number(d.period.gross_profit) / Number(d.period.revenue)) * 100 : null;
  const peak = Math.max(...d.trend.map((t) => Number(t.revenue)), 0);

  return (
    <>
      {header}

      {emptyCatalogue && (
        <Panel className="mb-5">
          <EmptyState icon={Boxes} title="Your inventory is empty" compact
            action={(
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={Plus} onClick={() => navigate('/inventory?new=1')}>Add your first product</Button>
                <Button variant="secondary" onClick={() => navigate('/purchases/new')}>Enter a supplier invoice</Button>
              </div>
            )}>
            Figures on this page come from your own sales, purchases and stock. Add products to get started.
          </EmptyState>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today's sales" value={moneyCompact(d.today.revenue)} sub={`${number(d.today.bills)} bills`} tone="primary" icon={Wallet} />
        <Stat label={`Sales · last ${days} days`} value={moneyCompact(d.period.revenue)} trend={trend}
          sub={trend == null ? `${number(d.period.bills)} bills` : `vs previous ${days} days`} />
        <Stat label="Gross profit" value={moneyCompact(d.period.gross_profit)} sub={margin != null ? `${margin.toFixed(1)}% margin` : 'No sales yet'} />
        <Stat label="Stock value (cost)" value={moneyCompact(s.value_at_cost)} sub={`${number(s.products)} products · MRP ${moneyCompact(s.value_at_mrp)}`} />
      </div>

      {can('alerts.view') && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat to="/alerts?tab=expired" label="Expired on shelf" value={number(s.expired_batches)} sub={`${money(s.expired_value)} at cost`} tone={s.expired_batches ? 'danger' : undefined} icon={PackageX} />
          <Stat to="/alerts?tab=expiring" label={`Expiring ≤ ${pharmacy.settings.expiry_warning_days} days`} value={number(s.expiring_batches)} sub={`${money(s.expiring_value)} at cost`} tone={s.expiring_batches ? 'warning' : undefined} icon={AlertTriangle} />
          <Stat to="/alerts?tab=low" label="Low / out of stock" value={`${number(s.low_stock)} / ${number(s.out_of_stock)}`} sub="below minimum level" tone={s.out_of_stock ? 'danger' : s.low_stock ? 'warning' : undefined} />
          <Stat to="/purchases?status=unpaid" label="Supplier payables" value={moneyCompact(d.payables)} sub="unpaid purchase invoices" />
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Sales trend" description="Net of returns and cancellations"
          actions={<Segmented size="sm" options={PERIODS} value={days} onChange={setDays} />}>
          {peak === 0 ? (
            <EmptyState compact title="No sales in this period">Completed bills will appear here as they happen.</EmptyState>
          ) : (
            <div className={`h-[260px] ${loading ? 'opacity-60' : ''}`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => date(v, { day: '2-digit', month: 'short' })} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickFormatter={(v) => moneyCompact(v)} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--border-strong)' }} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Top products" description={`By revenue, last ${days} days`} padded={false}>
          {d.top_products.length === 0 ? <EmptyState compact title="No sales yet" /> : (
            <ol className="divide-y divide-line">
              {d.top_products.map((p, i) => {
                const share = (Number(p.revenue) / Number(d.top_products[0].revenue)) * 100;
                return (
                  <li key={p.name} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate"><span className="mr-2 text-ink-3 num">{i + 1}</span>{p.name}</span>
                      <span className="num font-medium">{money(p.revenue)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${share}%` }} /></span>
                      <span className="text-[11px] text-ink-3 num">{number(p.units)} units</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Recent bills" padded={false}
          actions={<Link to="/sales" className="text-xs font-medium text-primary hover:underline">All sales</Link>}>
          {d.recent_sales.length === 0 ? <EmptyState compact title="No bills yet" action={<Button size="sm" onClick={() => navigate('/pos')}>Open POS</Button>} /> : (
            <ul className="divide-y divide-line">
              {d.recent_sales.map((s2) => (
                <li key={s2.id}>
                  <Link to={`/sales/${s2.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span className="code text-ink-2">{s2.invoice_no}</span>
                    <span className="hidden min-w-0 flex-1 truncate text-ink-3 sm:block">{s2.customer_name || 'Walk-in'}</span>
                    <span className="ml-auto text-xs text-ink-3">{dateTime(s2.created_at)}</span>
                    <SaleStatusBadge status={s2.status} />
                    <span className="w-24 text-right num font-medium">{money(s2.total_amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Payment mix" description={`Last ${days} days`}>
          {d.payment_mix.length === 0 ? <p className="text-sm text-ink-3">No payments yet.</p> : (
            <ul className="space-y-3">
              {d.payment_mix.map((m) => {
                const total = d.payment_mix.reduce((a, x) => a + Number(x.amount), 0);
                const pct = total ? (Number(m.amount) / total) * 100 : 0;
                return (
                  <li key={m.method}>
                    <div className="flex justify-between text-sm"><span>{METHOD[m.method] ?? m.method}</span><span className="num">{money(m.amount)} <span className="text-ink-3">· {pct.toFixed(0)}%</span></span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-ink-3/60" style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
