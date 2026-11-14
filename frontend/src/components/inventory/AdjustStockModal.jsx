import { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import { ADJUSTMENT_TYPES, adjustStock } from '../../services/inventory';
import { expiryShort } from '../../lib/format';

/** Record a counted correction, damage or expiry write-off against one batch. */
export function AdjustStockModal({ batch, productName, onClose, onDone, defaultType = 'adjustment' }) {
  const [type, setType] = useState(defaultType);
  const [direction, setDirection] = useState('remove');
  const [qty, setQty] = useState(defaultType === 'expired_writeoff' && batch ? String(batch.quantity) : '');
  const [reason, setReason] = useState(defaultType === 'expired_writeoff' ? 'Expired — removed from shelf' : '');
  const [busy, setBusy] = useState(false);
  if (!batch) return null;

  const writeOff = type !== 'adjustment';
  const n = Number(qty);
  const change = writeOff || direction === 'remove' ? -n : n;
  const tooMany = change < 0 && -change > batch.quantity;
  const invalid = !Number.isInteger(n) || n <= 0 || tooMany || reason.trim().length < 3;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await adjustStock(batch.id, change, type, reason.trim());
      toast.success(`Stock updated: ${change > 0 ? '+' : ''}${change} on batch ${batch.batch_no}`);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Adjust stock"
      description={`${productName} · batch ${batch.batch_no} · exp ${expiryShort(batch.expiry_date)} · ${batch.quantity} in stock`}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="adjust-form" loading={busy} disabled={invalid}>Save adjustment</Button></>}
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} options={ADJUSTMENT_TYPES} />
        {!writeOff && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            {[['remove', 'Remove units'], ['add', 'Add units']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setDirection(v)}
                className={`rounded-md py-1.5 text-[13px] font-medium ${direction === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`}>{l}</button>
            ))}
          </div>
        )}
        <Input label="Quantity" type="number" min="1" step="1" inputMode="numeric" required value={qty} onChange={(e) => setQty(e.target.value)}
          hint={n > 0 && !tooMany ? `New balance: ${batch.quantity + change}` : undefined}
          error={tooMany ? `Only ${batch.quantity} in stock` : null} />
        <Textarea label="Reason" required rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)}
          hint="Recorded in the stock ledger and audit log." />
      </form>
    </Modal>
  );
}
