import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { BareInput, Select, Textarea } from '../ui/Field';
import { InlineAlert } from '../ui/States';
import { PAYMENT_METHODS, RETURN_REASONS, processReturn } from '../../services/sales';
import { money, expiryShort, daysUntil } from '../../lib/format';

/** Select lines and quantities to return. Stock and refund are handled by process_return. */
export function ReturnDialog({ sale, onClose, onDone }) {
  const returnable = useMemo(() => sale.items.filter((i) => i.quantity - i.returned_quantity > 0), [sale]);
  const [qty, setQty] = useState(() => Object.fromEntries(returnable.map((i) => [i.id, 0])));
  const [reason, setReason] = useState('customer_request');
  const [refundMethod, setRefundMethod] = useState(sale.payment_method === 'credit' ? 'credit' : sale.payment_method);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const restock = RETURN_REASONS.find((r) => r.value === reason)?.restock ?? true;
  const lines = returnable.filter((i) => qty[i.id] > 0);
  const refund = lines.reduce((s, i) => s + Math.round((i.line_total * qty[i.id] / i.quantity) * 100) / 100, 0);

  async function submit() {
    setBusy(true);
    try {
      const r = await processReturn({
        saleId: sale.id,
        items: lines.map((i) => ({ sale_item_id: i.id, quantity: qty[i.id], restock })),
        reason, refundMethod, notes,
      });
      toast.success(`Return ${r.return_no} recorded · refund ${money(r.refund_amount)}`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Return items · ${sale.invoice_no}`} size="lg"
      footer={(
        <>
          <span className="mr-auto text-sm text-ink-2">Refund <strong className="num text-ink">{money(refund)}</strong></span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!lines.length}>Record return</Button>
        </>
      )}>
      <div className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-ink-3">
              <tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Batch</th><th className="px-3 py-2 text-right">Sold</th><th className="px-3 py-2 text-right">Returnable</th><th className="px-3 py-2 text-right w-28">Return</th></tr>
            </thead>
            <tbody>
              {returnable.map((i) => {
                const max = i.quantity - i.returned_quantity;
                const expired = daysUntil(i.expiry_date) < 0;
                return (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-3 py-2">{i.product_name}</td>
                    <td className="px-3 py-2 code text-ink-2">{i.batch_no} · {expiryShort(i.expiry_date)}{expired && <span className="ml-1 text-danger">(expired)</span>}</td>
                    <td className="px-3 py-2 text-right num">{i.quantity}</td>
                    <td className="px-3 py-2 text-right num">{max}</td>
                    <td className="px-3 py-2">
                      <BareInput type="number" min="0" max={max} step="1" value={qty[i.id]} aria-label={`Return quantity for ${i.product_name}`}
                        onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))) })}
                        className="h-8 text-right num" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} options={RETURN_REASONS} />
          <Select label="Refund via" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} options={PAYMENT_METHODS} />
        </div>
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
        <InlineAlert tone={restock ? 'info' : 'warning'}>
          {restock
            ? 'Returned units go back into their original batch (unless the batch has expired).'
            : 'Units returned for this reason are refunded but not put back on the shelf.'}
        </InlineAlert>
      </div>
    </Modal>
  );
}
