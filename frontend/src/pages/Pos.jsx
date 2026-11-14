import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Minus, Plus, Printer, ScanLine, Search, ShoppingCart, Trash2, UserRound, X } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync, useDebounced } from '../hooks/useAsync';
import { useBarcodeWedge } from '../hooks/useBarcodeWedge';
import { lookupBarcode, posSearch, PRESCRIPTION_SCHEDULES } from '../services/inventory';
import { createSale, PAYMENT_METHODS } from '../services/sales';
import { previewTotals } from '../lib/pricing';
import { money, expiryShort } from '../lib/format';
import { Button, IconButton } from '../components/ui/Button';
import { BareInput, Input } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Kbd } from '../components/ui/Misc';
import { ScheduleBadge } from '../components/ui/Badge';
import { EmptyState, InlineAlert, Spinner } from '../components/ui/States';
import { BarcodeScanner } from '../components/scanner/BarcodeScanner';
import { ProductFormModal } from '../components/inventory/ProductFormModal';
import { InvoiceView } from '../components/sales/InvoiceView';

const newKey = () => crypto.randomUUID();

/**
 * Counter billing, optimised for speed: scan or type, adjust quantities,
 * take payment. The preview mirrors the database maths; create_sale decides
 * the final batches (FEFO), prices, GST and invoice number atomically.
 */
export default function Pos() {
  const { pharmacy, branch, role, settings, can } = useSession();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 200);
  const [highlight, setHighlight] = useState(0);
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [doctor, setDoctor] = useState('');
  const [payment, setPayment] = useState('cash');
  const [billDiscount, setBillDiscount] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [checkingOut, setCheckingOut] = useState(false);
  const [completed, setCompleted] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [unknownCode, setUnknownCode] = useState(null);
  const [registerCode, setRegisterCode] = useState(null);
  const searchRef = useRef(null);

  const maxDiscount = Number(role === 'cashier' ? settings.cashier_max_discount_pct : settings.max_discount_pct) || 0;
  const needsPrescription = cart.some((l) => PRESCRIPTION_SCHEDULES.includes(l.schedule));

  const search = useAsync(
    () => (debounced.length >= 2 ? posSearch(pharmacy.id, branch.id, debounced) : Promise.resolve([])),
    [debounced, pharmacy.id, branch.id],
  );
  const results = query.trim().length >= 2 ? search.data ?? [] : [];
  const searching = search.loading && debounced.length >= 2;
  useEffect(() => { if (search.error) toast.error(search.error.message); }, [search.error]);

  const addToCart = useCallback((p) => {
    if (!p.available) {
      toast.error(`${p.name} has no sellable stock in ${branch.name}`);
      return;
    }
    setCart((c) => {
      const existing = c.find((l) => l.product_id === p.id);
      if (existing) {
        if (existing.quantity >= p.available) { toast.error(`Only ${p.available} in stock`); return c; }
        return c.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...c, {
        product_id: p.id, name: p.name, generic_name: p.generic_name, schedule: p.schedule, unit: p.unit,
        gst_rate: Number(p.gst_rate), price: Number(p.price), mrp: Number(p.mrp), available: p.available,
        next_expiry: p.next_expiry, rack: p.rack_location, quantity: 1, discount_pct: Number(billDiscount) || 0,
      }];
    });
    setQuery('');
    setHighlight(0);
    searchRef.current?.focus();
  }, [branch.name, billDiscount]);

  const handleCode = useCallback(async (code) => {
    setScannerOpen(false);
    try {
      const product = await lookupBarcode(pharmacy.id, code, branch.id);
      if (!product) { setUnknownCode(code); return; }
      const batches = product.batches || [];
      addToCart({
        ...product,
        available: batches.reduce((s, b) => s + b.quantity, 0),
        price: batches[0]?.selling_price, mrp: batches[0]?.mrp, next_expiry: batches[0]?.expiry_date,
      });
    } catch (e) {
      toast.error(e.message);
    }
  }, [pharmacy.id, branch.id, addToCart]);

  useBarcodeWedge(handleCode, { enabled: !completed && !scannerOpen && !registerCode });

  useEffect(() => {
    const onKey = (e) => {
      if (completed) return;
      if ((e.key === '/' || e.key === 'F2') && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F9' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); document.getElementById('pos-checkout')?.click(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [completed]);

  const totals = useMemo(() => previewTotals(cart), [cart]);
  const updateLine = (id, patch) => setCart((c) => c.map((l) => (l.product_id === id ? { ...l, ...patch } : l)));
  const removeLine = (id) => setCart((c) => c.filter((l) => l.product_id !== id));

  function applyBillDiscount(v) {
    const pct = Math.max(0, Math.min(maxDiscount, Number(v) || 0));
    setBillDiscount(pct);
    setCart((c) => c.map((l) => ({ ...l, discount_pct: pct })));
  }

  function resetBill() {
    setCart([]); setCustomer({ name: '', phone: '' }); setDoctor(''); setPayment('cash');
    setBillDiscount(0); setIdempotencyKey(newKey()); setCompleted(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  const missingRx = needsPrescription && (!doctor.trim() || !customer.name.trim());
  const blocked = !cart.length || missingRx || cart.some((l) => l.quantity > l.available || l.quantity < 1);

  async function checkout() {
    if (blocked || checkingOut) return;
    setCheckingOut(true);
    try {
      const sale = await createSale({
        pharmacyId: pharmacy.id, branchId: branch.id, items: cart, paymentMethod: payment, idempotencyKey,
        customerName: customer.name.trim(), customerPhone: customer.phone.trim(), doctorName: doctor.trim(),
      });
      setCompleted(sale);
      toast.success(`Bill ${sale.invoice_no} saved`);
    } catch (e) {
      // The idempotency key is kept, so retrying after a network error cannot double-bill.
      toast.error(e.message, { duration: 6000 });
    } finally {
      setCheckingOut(false);
    }
  }

  function onSearchKey(e) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(results.length - 1, h + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); addToCart(results[highlight]); }
    if (e.key === 'Escape') setQuery('');
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col lg:flex-row">
      {/* Left: search + cart */}
      <section className="flex min-w-0 flex-1 flex-col border-line lg:border-r">
        <div className="relative border-b border-line bg-surface px-4 py-3 sm:px-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
              <BareInput
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
                onKeyDown={onSearchKey}
                placeholder="Search medicine, generic name or scan barcode"
                className="h-11 pl-9 text-[15px]"
                data-scan-target="true"
                aria-label="Search products"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="pos-results"
                autoComplete="off"
              />
              {searching && <Spinner size={15} className="absolute right-3 top-1/2 -translate-y-1/2" />}
            </div>
            <Button variant="secondary" size="lg" icon={ScanLine} onClick={() => setScannerOpen(true)} aria-label="Scan with camera"><span className="hidden sm:inline">Scan</span></Button>
          </div>

          {results.length > 0 && (
            <ul id="pos-results" role="listbox" className="absolute inset-x-4 top-[calc(100%-4px)] z-20 max-h-[380px] overflow-y-auto scroll-thin rounded-xl border border-line bg-surface shadow-pop sm:inset-x-5">
              {results.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === highlight}>
                  <button type="button" onMouseEnter={() => setHighlight(i)} onClick={() => addToCart(p)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === highlight ? 'bg-primary-soft' : ''} ${p.available ? '' : 'opacity-60'}`}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate font-medium text-ink">{p.name}</span><ScheduleBadge schedule={p.schedule} /></span>
                      <span className="block truncate text-xs text-ink-3">{[p.generic_name, p.manufacturer, p.rack_location && `Rack ${p.rack_location}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-right">
                      <span className="block num font-medium">{p.price != null ? money(p.price) : '—'}</span>
                      <span className={`block text-xs num ${p.available ? 'text-ink-3' : 'text-danger'}`}>{p.available ? `${p.available} in stock · exp ${expiryShort(p.next_expiry)}` : 'Out of stock'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {debounced.length >= 2 && !searching && results.length === 0 && (
            <p className="mt-2 text-xs text-ink-3">No products match “{debounced}”.</p>
          )}
        </div>

        {unknownCode && (
          <div className="px-4 pt-3 sm:px-5">
            <InlineAlert tone="warning" title={`No product with barcode ${unknownCode}`}
              action={(
                <div className="flex gap-1">
                  {can('inventory.edit') && <Button size="sm" variant="secondary" onClick={() => { setRegisterCode(unknownCode); setUnknownCode(null); }}>Register product</Button>}
                  <IconButton icon={X} label="Dismiss" onClick={() => setUnknownCode(null)} />
                </div>
              )}>
              It isn't in this pharmacy's catalogue.{!can('inventory.edit') && ' Ask a pharmacist to add it.'}
            </InlineAlert>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scroll-thin bg-bg px-4 py-3 sm:px-5">
          {cart.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Start a bill">
              Scan a barcode or search above. <span className="hidden sm:inline">Press <Kbd>/</Kbd> to search, <Kbd>F9</Kbd> to complete.</span>
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-[11px] uppercase tracking-wide text-ink-3">
                  <tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-center">Qty</th><th className="hidden px-3 py-2 text-right sm:table-cell">Disc %</th><th className="px-3 py-2 text-right">Amount</th><th className="w-10" /></tr>
                </thead>
                <tbody>
                  {cart.map((l) => {
                    const line = previewTotals([l]);
                    const over = l.quantity > l.available;
                    return (
                      <tr key={l.product_id} className="border-b border-line/70 last:border-0">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2"><span className="font-medium">{l.name}</span><ScheduleBadge schedule={l.schedule} /></div>
                          <div className="text-xs text-ink-3">{[l.generic_name, `MRP ${money(l.mrp)}`, `GST ${l.gst_rate}%`, l.rack && `Rack ${l.rack}`].filter(Boolean).join(' · ')}</div>
                          {over && <div className="text-xs text-danger">Only {l.available} in stock</div>}
                        </td>
                        <td className="px-3 py-2.5 text-right num">{money(l.price)}</td>
                        <td className="px-3 py-2.5">
                          <div className="mx-auto flex w-[116px] items-center rounded-lg border border-line-strong">
                            <button type="button" className="p-2 text-ink-2 hover:text-ink" aria-label={`Decrease ${l.name}`} onClick={() => (l.quantity > 1 ? updateLine(l.product_id, { quantity: l.quantity - 1 }) : removeLine(l.product_id))}><Minus size={14} /></button>
                            <input type="number" min="1" max={l.available} value={l.quantity} aria-label={`Quantity of ${l.name}`}
                              onChange={(e) => updateLine(l.product_id, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                              className={`w-10 bg-transparent text-center num focus:outline-none ${over ? 'text-danger' : ''}`} />
                            <button type="button" className="p-2 text-ink-2 hover:text-ink disabled:opacity-30" aria-label={`Increase ${l.name}`} disabled={l.quantity >= l.available} onClick={() => updateLine(l.product_id, { quantity: l.quantity + 1 })}><Plus size={14} /></button>
                          </div>
                        </td>
                        <td className="hidden px-3 py-2.5 text-right sm:table-cell">
                          <input type="number" min="0" max={maxDiscount} step="0.5" value={l.discount_pct} aria-label={`Discount on ${l.name}`} disabled={maxDiscount === 0}
                            onChange={(e) => updateLine(l.product_id, { discount_pct: Math.max(0, Math.min(maxDiscount, Number(e.target.value) || 0)) })}
                            className="h-8 w-16 rounded-md border border-line-strong bg-surface px-2 text-right num disabled:opacity-40" />
                        </td>
                        <td className="px-3 py-2.5 text-right num font-medium">{money(line.gross - line.discount)}</td>
                        <td className="pr-2"><IconButton icon={Trash2} label={`Remove ${l.name}`} onClick={() => removeLine(l.product_id)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Right: checkout */}
      <aside className="w-full shrink-0 border-t border-line bg-surface lg:sticky lg:top-14 lg:h-[calc(100vh-56px)] lg:w-[360px] lg:border-t-0">
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto scroll-thin p-4 sm:p-5">
            <div>
              <div className="eyebrow mb-2 flex items-center gap-1.5"><UserRound size={12} aria-hidden /> Patient {needsPrescription ? '(required)' : '(optional)'}</div>
              <div className="grid grid-cols-2 gap-2">
                <BareInput value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Name" aria-label="Patient name" aria-invalid={needsPrescription && !customer.name.trim() ? true : undefined} />
                <BareInput value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Mobile" type="tel" aria-label="Patient mobile" />
              </div>
            </div>
            {needsPrescription && (
              <Input label="Prescribing doctor" required value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="Dr. name, registration no."
                hint="Schedule H/H1/X medicines need a prescription." error={!doctor.trim() ? 'Required for scheduled drugs' : null} />
            )}
            <div>
              <div className="eyebrow mb-2">Payment</div>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Payment method">
                {PAYMENT_METHODS.map((m) => (
                  <button key={m.value} type="button" role="radio" aria-checked={payment === m.value} onClick={() => setPayment(m.value)}
                    className={`rounded-md py-2 text-[13px] font-medium ${payment === m.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}>{m.label}</button>
                ))}
              </div>
              {payment === 'credit' && !customer.phone.trim() && <p className="mt-1.5 text-xs text-warning">Add the customer's mobile for credit bills.</p>}
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="bill-disc" className="text-sm text-ink-2">Discount on all items <span className="text-xs text-ink-3">(max {maxDiscount}%)</span></label>
              <div className="relative">
                <input id="bill-disc" type="number" min="0" max={maxDiscount} step="0.5" value={billDiscount} disabled={maxDiscount === 0 || !cart.length}
                  onChange={(e) => applyBillDiscount(e.target.value)} className="h-9 w-20 rounded-lg border border-line-strong bg-surface pl-2 pr-6 text-right num disabled:opacity-40" />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-3">%</span>
              </div>
            </div>

            <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-3">Items ({cart.reduce((s, l) => s + l.quantity, 0)})</dt><dd className="num">{money(totals.gross)}</dd></div>
              {totals.discount > 0 && <div className="flex justify-between"><dt className="text-ink-3">Discount</dt><dd className="num text-success">−{money(totals.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-3">GST included</dt><dd className="num">{money(totals.tax)}</dd></div>
              {totals.roundOff !== 0 && <div className="flex justify-between"><dt className="text-ink-3">Round off</dt><dd className="num">{totals.roundOff.toFixed(2)}</dd></div>}
            </dl>
          </div>

          <div className="border-t border-line p-4 sm:p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-ink-2">To collect</span>
              <span className="text-[28px] font-semibold leading-none num">{money(totals.total)}</span>
            </div>
            {missingRx && cart.length > 0 && <p className="mb-2 text-xs text-danger">Enter the patient and doctor for scheduled medicines.</p>}
            <Button id="pos-checkout" size="lg" className="w-full" onClick={checkout} loading={checkingOut} disabled={blocked}>
              Complete bill <span className="ml-1 hidden text-xs opacity-70 sm:inline">F9</span>
            </Button>
            {cart.length > 0 && <button type="button" onClick={resetBill} className="mt-2 w-full text-center text-xs text-ink-3 hover:text-danger">Clear bill</button>}
            <p className="mt-3 text-[11px] leading-snug text-ink-3">Stock is taken from the earliest-expiring batches. Final batch prices and GST are confirmed on the invoice.</p>
          </div>
        </div>
      </aside>

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleCode} />

      <ProductFormModal open={Boolean(registerCode)} initialBarcode={registerCode} onClose={() => setRegisterCode(null)}
        onSaved={() => { const code = registerCode; setRegisterCode(null); if (code) handleCode(code); }} />

      <Modal open={Boolean(completed)} onClose={resetBill} size="lg" title={`Bill ${completed?.invoice_no ?? ''} saved`}
        description={completed ? `${money(completed.total_amount)} · ${PAYMENT_METHODS.find((m) => m.value === completed.payment_method)?.label}` : ''}
        footer={(
          <>
            <Link to={`/sales/${completed?.id}`} className="mr-auto text-sm font-medium text-primary hover:underline">Open in sales history</Link>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button onClick={resetBill} data-autofocus>New bill</Button>
          </>
        )}>
        {completed && <InvoiceView sale={completed} />}
      </Modal>
    </div>
  );
}
