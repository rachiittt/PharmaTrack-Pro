import { money, date, expiryShort, dateTime } from '../../lib/format';
import { PAYMENT_METHODS } from '../../services/sales';

const methodLabel = (m) => PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m;

/**
 * Printable GST tax invoice built from get_sale(). A4 via the browser's print
 * dialog ("Save as PDF" for a download).
 */
export function InvoiceView({ sale }) {
  const ph = sale.pharmacy || {};
  const gstRows = Object.values(sale.items.reduce((acc, i) => {
    const k = Number(i.gst_rate);
    acc[k] ??= { rate: k, taxable: 0, tax: 0 };
    acc[k].taxable += Number(i.taxable_amount);
    acc[k].tax += Number(i.tax_amount);
    return acc;
  }, {})).sort((a, b) => a.rate - b.rate);

  return (
    <article className="print-area mx-auto max-w-[800px] rounded-xl border border-line bg-white p-6 text-[13px] text-neutral-900 sm:p-8">
      <header className="flex flex-col gap-4 border-b border-neutral-300 pb-4 sm:flex-row sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">{ph.name}</h2>
          <p className="text-neutral-600">{[sale.branch?.address || ph.address, ph.city, ph.state].filter(Boolean).join(', ')}</p>
          <p className="text-neutral-600">{[sale.branch?.phone || ph.phone].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 text-xs text-neutral-600">
            {ph.gstin && <>GSTIN <span className="code">{ph.gstin}</span></>}
            {ph.drug_license_no && <> · DL <span className="code">{ph.drug_license_no}</span></>}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Tax invoice</p>
          <p className="code text-base font-semibold">{sale.invoice_no}</p>
          <p className="text-neutral-600">{dateTime(sale.created_at)}</p>
          {sale.status !== 'completed' && <p className="mt-1 font-semibold uppercase text-red-700">{sale.status.replace('_', ' ')}</p>}
        </div>
      </header>

      {(sale.customer_name || sale.customer_phone || sale.doctor_name) && (
        <div className="grid gap-2 border-b border-neutral-300 py-3 sm:grid-cols-2">
          <p><span className="text-neutral-500">Patient: </span>{sale.customer_name || '—'}{sale.customer_phone && ` · ${sale.customer_phone}`}</p>
          {sale.doctor_name && <p><span className="text-neutral-500">Prescribed by: </span>{sale.doctor_name}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="mt-3 w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="py-1.5 pr-2">#</th><th className="py-1.5 pr-2">Item</th><th className="py-1.5 pr-2">Batch</th>
              <th className="py-1.5 pr-2">Exp</th><th className="py-1.5 pr-2 text-right">Qty</th><th className="py-1.5 pr-2 text-right">MRP</th>
              <th className="py-1.5 pr-2 text-right">Rate</th><th className="py-1.5 pr-2 text-right">Disc</th><th className="py-1.5 pr-2 text-right">GST</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((i, n) => (
              <tr key={i.id} className="border-b border-neutral-200 align-top">
                <td className="py-1.5 pr-2 text-neutral-500">{n + 1}</td>
                <td className="py-1.5 pr-2">{i.product_name}{i.returned_quantity > 0 && <span className="block text-[11px] text-red-700">Returned: {i.returned_quantity}</span>}</td>
                <td className="py-1.5 pr-2 code">{i.batch_no}</td>
                <td className="py-1.5 pr-2 code">{expiryShort(i.expiry_date)}</td>
                <td className="py-1.5 pr-2 text-right num">{i.quantity}</td>
                <td className="py-1.5 pr-2 text-right num">{Number(i.mrp).toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right num">{Number(i.unit_price).toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right num">{Number(i.discount_pct) ? `${Number(i.discount_pct)}%` : '—'}</td>
                <td className="py-1.5 pr-2 text-right num">{Number(i.gst_rate)}%</td>
                <td className="py-1.5 text-right num">{Number(i.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:justify-between">
        <table className="text-[12px] text-neutral-700">
          <thead><tr className="text-left text-[11px] uppercase text-neutral-500"><th className="pr-4">GST</th><th className="pr-4 text-right">Taxable</th><th className="pr-4 text-right">CGST</th><th className="text-right">SGST</th></tr></thead>
          <tbody>
            {gstRows.map((g) => (
              <tr key={g.rate}><td className="pr-4">{g.rate}%</td><td className="pr-4 text-right num">{g.taxable.toFixed(2)}</td>
                <td className="pr-4 text-right num">{(g.tax / 2).toFixed(2)}</td><td className="text-right num">{(g.tax / 2).toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
        <dl className="min-w-[220px] space-y-1 text-[13px]">
          <div className="flex justify-between"><dt className="text-neutral-500">Items total</dt><dd className="num">{money(sale.subtotal)}</dd></div>
          {Number(sale.discount_amount) > 0 && <div className="flex justify-between"><dt className="text-neutral-500">Discount</dt><dd className="num">−{money(sale.discount_amount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-neutral-500">Taxable value</dt><dd className="num">{money(sale.taxable_amount)}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500">GST</dt><dd className="num">{money(sale.tax_amount)}</dd></div>
          {Number(sale.round_off) !== 0 && <div className="flex justify-between"><dt className="text-neutral-500">Round off</dt><dd className="num">{Number(sale.round_off).toFixed(2)}</dd></div>}
          <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-base font-bold"><dt>Total</dt><dd className="num">{money(sale.total_amount)}</dd></div>
          <div className="flex justify-between text-neutral-600"><dt>Paid by</dt><dd>{methodLabel(sale.payment_method)}</dd></div>
          {Number(sale.refunded_amount) > 0 && <div className="flex justify-between text-red-700"><dt>Refunded</dt><dd className="num">−{money(sale.refunded_amount)}</dd></div>}
        </dl>
      </div>

      <footer className="mt-6 border-t border-neutral-300 pt-3 text-[11px] text-neutral-500">
        <p>Billed by {sale.created_by_name || 'staff'} · {date(sale.created_at)}. Prices are inclusive of GST. Medicines once sold are returnable only as per store policy.</p>
        {sale.returns?.length > 0 && <p className="mt-1">Returns: {sale.returns.map((r) => `${r.return_no} (${money(r.refund_amount)})`).join(', ')}</p>}
      </footer>
    </article>
  );
}
