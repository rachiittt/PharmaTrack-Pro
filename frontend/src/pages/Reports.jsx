import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { salesReport } from '../services/insights';
import { listInventory } from '../services/inventory';
import { supplierSummary } from '../services/suppliers';
import { money, moneyCompact, date, daysAgoIso, todayIso, number } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { Button } from '../components/ui/Button';
import { BareInput } from '../components/ui/Field';
import { Panel } from '../components/ui/Panel';
import { DataTable } from '../components/ui/DataTable';
import { PageHeader, Segmented, Stat } from '../components/ui/Misc';
import { EmptyState, ErrorState } from '../components/ui/States';

const RANGES = [
  { value: 'month', label: 'This month' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'custom', label: 'Custom' },
];

function rangeFor(key) {
  if (key === 'month') { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'), todayIso()]; }
  return [daysAgoIso(Number(key) - 1), todayIso()];
}

export default function Reports() {
  const { pharmacy, branch } = useSession();
  const [range, setRange] = useState('month');
  const [custom, setCustom] = useState(rangeFor('30'));
  const [from, to] = range === 'custom' ? custom : rangeFor(range);
  const report = useAsync(() => salesReport(pharmacy.id, from, to, branch?.id ?? null), [pharmacy.id, from, to, branch?.id]);
  const suppliers = useAsync(() => supplierSummary(pharmacy.id), [pharmacy.id]);

  const totals = useMemo(() => (report.data?.daily || []).reduce((t, d) => ({
    bills: t.bills + Number(d.bills), net: t.net + Number(d.net), tax: t.tax + Number(d.tax), discount: t.discount + Number(d.discount), refunds: t.refunds + Number(d.refunds),
  }), { bills: 0, net: 0, tax: 0, discount: 0, refunds: 0 }), [report.data]);

  async function exportValuation() {
    try {
      const rows = [];
      for (let offset = 0; ; offset += 200) {
        const page = await listInventory({ pharmacyId: pharmacy.id, branchId: branch?.id ?? null, limit: 200, offset });
        rows.push(...page.rows);
        if (rows.length >= page.total || !page.rows.length) break;
      }
      downloadCsv(`stock-valuation-${todayIso()}.csv`, rows, [
        { label: 'Product', value: 'name' }, { label: 'Category', value: 'category' }, { label: 'Sellable qty', value: 'sellable_qty' },
        { label: 'Expired qty', value: 'expired_qty' }, { label: 'Value at cost', value: 'stock_value' }, { label: 'Next expiry', value: 'next_expiry' },
      ]);
    } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <PageHeader title="Reports" description={`${date(from)} – ${date(to)}${branch ? ` · ${branch.name}` : ''}`}
        actions={(
          <>
            <Segmented value={range} onChange={setRange} options={RANGES} />
            {range === 'custom' && (
              <div className="flex gap-2">
                <BareInput type="date" value={custom[0]} max={custom[1]} onChange={(e) => setCustom([e.target.value, custom[1]])} aria-label="From" className="w-[150px]" />
                <BareInput type="date" value={custom[1]} min={custom[0]} max={todayIso()} onChange={(e) => setCustom([custom[0], e.target.value])} aria-label="To" className="w-[150px]" />
              </div>
            )}
          </>
        )} />

      {report.error ? <ErrorState error={report.error} onRetry={report.reload} /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Net sales" value={moneyCompact(totals.net)} sub={`${number(totals.bills)} bills`} tone="primary" />
            <Stat label="GST collected" value={money(totals.tax)} sub="CGST + SGST" />
            <Stat label="Discounts given" value={money(totals.discount)} />
            <Stat label="Refunds" value={money(totals.refunds)} tone={totals.refunds ? 'warning' : undefined} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2" title="Daily net sales"
              actions={<Button size="sm" variant="secondary" icon={Download} disabled={!report.data?.daily.length}
                onClick={() => downloadCsv(`sales-${from}-to-${to}.csv`, report.data.daily, [
                  { label: 'Date', value: 'day' }, { label: 'Bills', value: 'bills' }, { label: 'Taxable', value: 'taxable' }, { label: 'GST', value: 'tax' },
                  { label: 'Discount', value: 'discount' }, { label: 'Gross', value: 'gross' }, { label: 'Refunds', value: 'refunds' }, { label: 'Net', value: 'net' },
                ])}>CSV</Button>}>
              {!report.data ? <div className="h-[240px]" /> : report.data.daily.length === 0 ? <EmptyState compact title="No sales in this range" /> : (
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tickFormatter={(v) => date(v, { day: '2-digit', month: 'short' })} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                      <YAxis tickFormatter={moneyCompact} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                      <Tooltip formatter={(v) => money(v)} labelFormatter={(v) => date(v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'var(--surface-2)' }} />
                      <Bar dataKey="net" name="Net sales" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel title="GST summary" description="For GSTR-1 / 3B preparation" padded={false}
              actions={<Button size="sm" variant="secondary" icon={Download} disabled={!report.data?.gst.length}
                onClick={() => downloadCsv(`gst-${from}-to-${to}.csv`, report.data.gst, [
                  { label: 'GST rate %', value: 'gst_rate' }, { label: 'Taxable value', value: 'taxable' }, { label: 'CGST', value: 'cgst' }, { label: 'SGST', value: 'sgst' }, { label: 'Total tax', value: 'tax' },
                ])}>CSV</Button>}>
              <DataTable rows={report.data?.gst} rowKey="gst_rate" loading={!report.data} columns={[
                { key: 'gst_rate', header: 'Rate', render: (g) => `${Number(g.gst_rate)}%` },
                { key: 'taxable', header: 'Taxable', align: 'right', render: (g) => money(g.taxable) },
                { key: 'cgst', header: 'CGST', align: 'right', render: (g) => money(g.cgst) },
                { key: 'sgst', header: 'SGST', align: 'right', render: (g) => money(g.sgst) },
              ]} empty={<EmptyState compact title="No taxable sales" />} />
            </Panel>
          </div>
        </>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Supplier-wise purchases" padded={false}
          actions={<Button size="sm" variant="secondary" icon={Download} disabled={!suppliers.data?.length}
            onClick={() => downloadCsv(`suppliers-${todayIso()}.csv`, suppliers.data, [
              { label: 'Supplier', value: 'name' }, { label: 'Purchases', value: 'purchases' }, { label: 'Purchased total', value: 'purchased_total' },
              { label: 'Outstanding', value: 'outstanding' }, { label: 'Overdue', value: 'overdue' }, { label: 'Last purchase', value: 'last_purchase_on' },
            ])}>CSV</Button>}>
          <DataTable rows={suppliers.data} rowKey="supplier_id" loading={suppliers.loading} columns={[
            { key: 'name', header: 'Supplier', render: (s) => <span className="font-medium">{s.name}</span> },
            { key: 'purchases', header: 'Invoices', align: 'right' },
            { key: 'purchased_total', header: 'Purchased', align: 'right', render: (s) => money(s.purchased_total) },
            { key: 'outstanding', header: 'Outstanding', align: 'right', render: (s) => money(s.outstanding) },
            { key: 'overdue', header: 'Overdue', align: 'right', hideBelow: 'sm', render: (s) => <span className={Number(s.overdue) ? 'text-danger' : ''}>{money(s.overdue)}</span> },
          ]} empty={<EmptyState compact title="No suppliers yet" />} />
        </Panel>
        <Panel title="Stock valuation" description="Every product with quantity and value at cost.">
          <Button variant="secondary" icon={Download} className="w-full" onClick={exportValuation}>Download CSV</Button>
        </Panel>
      </div>
    </>
  );
}
