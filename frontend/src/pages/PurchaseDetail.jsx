import { useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ExternalLink, IndianRupee } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { getPurchase, invoiceFileUrl, recordPayment } from '../services/purchases';
import { PAYMENT_METHODS } from '../services/sales';
import { money, date, expiryShort, todayIso } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { Panel, DetailList } from '../components/ui/Panel';
import { DataTable } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/Misc';
import { PaymentStatusBadge } from '../components/ui/Badge';
import { ErrorState, PageLoader } from '../components/ui/States';

export default function PurchaseDetail() {
  const { id } = useParams();
  const { can } = useSession();
  const { data: p, error, reload } = useAsync(() => getPurchase(id), [id]);
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: 'upi', reference: '' });
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState error={error} onRetry={reload} title="Purchase not found" />;
  if (!p) return <PageLoader />;
  const outstanding = Number(p.total_amount) - Number(p.amount_paid);
  const overdue = p.payment_status !== 'paid' && p.due_date && p.due_date < todayIso();

  async function openFile() {
    try { window.open(await invoiceFileUrl(p.invoice_file_path), '_blank', 'noopener'); } catch (e) { toast.error(e.message); }
  }

  async function submitPayment(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await recordPayment({ purchaseId: p.id, amount: pay.amount, method: pay.method, reference: pay.reference });
      toast.success('Payment recorded');
      setPaying(false); setPay({ amount: '', method: 'upi', reference: '' });
      reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader back={{ to: '/purchases', label: 'Purchases' }} title={`${p.suppliers.name} · ${p.supplier_invoice_no}`}
        meta={<PaymentStatusBadge status={p.payment_status} overdue={overdue} />}
        description={`${p.reference_no} · received into ${p.branches?.name} on ${date(p.created_at)}`}
        actions={(
          <>
            {p.invoice_file_path && <Button variant="secondary" icon={ExternalLink} onClick={openFile}>Invoice copy</Button>}
            {can('purchases.pay') && outstanding > 0 && <Button icon={IndianRupee} onClick={() => { setPay({ ...pay, amount: outstanding.toFixed(2) }); setPaying(true); }}>Record payment</Button>}
          </>
        )} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title={`Items (${p.purchase_items.length})`} padded={false}>
          <DataTable rows={p.purchase_items} columns={[
            { key: 'product', header: 'Product', render: (i) => <span className="font-medium">{i.products.name}</span> },
            { key: 'batch_no', header: 'Batch', render: (i) => <span className="code">{i.batch_no}</span> },
            { key: 'expiry', header: 'Exp', render: (i) => <span className="code">{expiryShort(i.expiry_date)}</span> },
            { key: 'qty', header: 'Qty', align: 'right', render: (i) => <>{i.quantity}{i.free_quantity > 0 && <span className="text-ink-3"> +{i.free_quantity}</span>}</> },
            { key: 'rate', header: 'Rate', align: 'right', render: (i) => money(i.purchase_price) },
            { key: 'mrp', header: 'MRP', align: 'right', hideBelow: 'sm', render: (i) => money(i.mrp) },
            { key: 'gst', header: 'GST', align: 'right', hideBelow: 'md', render: (i) => `${Number(i.gst_rate)}%` },
            { key: 'total', header: 'Amount', align: 'right', render: (i) => money(i.line_total) },
          ]} />
        </Panel>
        <div className="space-y-4">
          <Panel title="Amounts">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-3">Taxable</dt><dd className="num">{money(p.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">GST</dt><dd className="num">{money(p.tax_amount)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>Total</dt><dd className="num">{money(p.total_amount)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Paid</dt><dd className="num">{money(p.amount_paid)}</dd></div>
              <div className={`flex justify-between font-medium ${outstanding > 0 ? (overdue ? 'text-danger' : 'text-warning') : 'text-success'}`}><dt>Outstanding</dt><dd className="num">{money(outstanding)}</dd></div>
            </dl>
          </Panel>
          <Panel title="Details">
            <DetailList columns={2} items={[
              { label: 'Invoice date', value: date(p.invoice_date) },
              { label: 'Due', value: date(p.due_date) },
              { label: 'Supplier GSTIN', value: p.suppliers.gstin && <span className="code">{p.suppliers.gstin}</span> },
              { label: 'Supplier phone', value: p.suppliers.phone },
              p.notes && { label: 'Notes', value: p.notes },
            ]} />
          </Panel>
          {p.supplier_payments.length > 0 && (
            <Panel title="Payments" padded={false}>
              <ul className="divide-y divide-line text-sm">
                {p.supplier_payments.map((sp) => (
                  <li key={sp.id} className="flex justify-between px-4 py-2.5"><span>{date(sp.paid_on)} · {PAYMENT_METHODS.find((m) => m.value === sp.method)?.label}{sp.reference && <span className="code text-ink-3"> {sp.reference}</span>}</span><span className="num">{money(sp.amount)}</span></li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <Modal open={paying} onClose={() => setPaying(false)} title="Record supplier payment" size="sm" description={`Outstanding ${money(outstanding)}`}
        footer={<><Button variant="secondary" onClick={() => setPaying(false)}>Cancel</Button><Button type="submit" form="pay-form" loading={busy}>Save payment</Button></>}>
        <form id="pay-form" onSubmit={submitPayment} className="space-y-4">
          <Input label="Amount" type="number" min="0.01" max={outstanding} step="0.01" prefix="₹" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          <Select label="Method" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={PAYMENT_METHODS.filter((m) => m.value !== 'credit')} />
          <Input label="Reference" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} hint="UTR / cheque no." />
        </form>
      </Modal>
    </>
  );
}
