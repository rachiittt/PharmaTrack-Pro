import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, FileUp, Plus, ScanLine, Sparkles, Trash2 } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync, useDebounced } from '../hooks/useAsync';
import { useBarcodeWedge } from '../hooks/useBarcodeWedge';
import { listSuppliers, createSupplier } from '../services/suppliers';
import { getProduct, listProductOptions, lookupBarcode, GST_RATES } from '../services/inventory';
import { receivePurchase, uploadInvoiceFile } from '../services/purchases';
import { aiStatus, extractInvoice } from '../services/ai';
import { purchaseLineTotals } from '../lib/pricing';
import { money, todayIso } from '../lib/format';
import { PAYMENT_METHODS } from '../services/sales';
import { Button, IconButton } from '../components/ui/Button';
import { BareInput, BareSelect, Input, Select, Textarea } from '../components/ui/Field';
import { Panel } from '../components/ui/Panel';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/Misc';
import { InlineAlert, Spinner } from '../components/ui/States';
import { BarcodeScanner } from '../components/scanner/BarcodeScanner';
import { ProductFormModal } from '../components/inventory/ProductFormModal';

let lineSeq = 0;
const blankLine = (product) => ({
  key: ++lineSeq, product_id: product?.id ?? '', product_name: product?.name ?? '', batch_no: '', mfg_date: '', expiry_date: '',
  quantity: '', free_quantity: '', purchase_price: '', mrp: '', selling_price: '', gst_rate: product?.gst_rate ?? 12, warnings: [],
});

function ProductPicker({ pharmacyId, value, label, onSelect, onCreate }) {
  const [text, setText] = useState(label || '');
  const [open, setOpen] = useState(false);
  const q = useDebounced(text.trim(), 200);
  const found = useAsync(() => (open && q.length >= 2 ? listProductOptions(pharmacyId, q) : Promise.resolve([])), [q, open, pharmacyId]);
  const options = found.data ?? [];
  return (
    <div className="relative">
      <BareInput value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Search product…" aria-label="Product"
        aria-invalid={!value ? true : undefined} className="h-8 min-w-[180px] text-[13px]" />
      {open && q.length >= 2 && (
        <ul className="absolute left-0 top-9 z-30 max-h-60 w-[300px] overflow-y-auto rounded-lg border border-line bg-surface shadow-pop">
          {options.map((o) => (
            <li key={o.id}><button type="button" onMouseDown={() => { onSelect(o); setText(o.name); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-[13px] hover:bg-surface-2">{o.name}<span className="block text-xs text-ink-3">{o.generic_name}</span></button></li>
          ))}
          <li><button type="button" onMouseDown={() => onCreate(text)} className="flex w-full items-center gap-1.5 border-t border-line px-3 py-2 text-left text-[13px] font-medium text-primary hover:bg-surface-2">
            <Plus size={13} /> New product “{text.trim()}”</button></li>
        </ul>
      )}
    </div>
  );
}

function QuickSupplierModal({ open, onClose, onCreated, pharmacyId }) {
  const [form, setForm] = useState({ name: '', phone: '', gstin: '', payment_terms_days: 30 });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { const s = await createSupplier(pharmacyId, form); toast.success('Supplier added'); onCreated(s); onClose(); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add supplier" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="qs-form" loading={busy}>Add</Button></>}>
      <form id="qs-form" onSubmit={submit} className="space-y-4">
        <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Credit days" type="number" min="0" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} />
        </div>
        <Input label="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} inputClassName="code uppercase" maxLength={15} />
      </form>
    </Modal>
  );
}

function lineErrors(l, today) {
  const e = [];
  if (!l.product_id) e.push('choose a product');
  if (!l.batch_no.trim()) e.push('batch');
  if (!l.expiry_date) e.push('expiry');
  else if (l.expiry_date <= today) e.push('expired');
  if (!(Number(l.quantity) > 0)) e.push('qty');
  if (l.purchase_price === '' || Number(l.purchase_price) < 0) e.push('rate');
  if (!(Number(l.mrp) > 0)) e.push('MRP');
  if (l.selling_price === '' || Number(l.selling_price) > Number(l.mrp)) e.push('selling ≤ MRP');
  return e;
}

/** Stock receiving against a supplier invoice. Saved atomically by receive_purchase. */
export default function PurchaseNew() {
  const { pharmacy, branch } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const suppliers = useAsync(() => listSuppliers(pharmacy.id, { activeOnly: true }), [pharmacy.id]);
  const ai = useAsync(() => aiStatus(pharmacy.id).catch(() => ({ configured: false })), [pharmacy.id]);
  const [header, setHeader] = useState({ supplier_id: '', invoice_no: '', invoice_date: todayIso(), due_date: '', amount_paid: '', payment_method: 'cash', notes: '' });
  const [lines, setLines] = useState([blankLine()]);
  const [filePath, setFilePath] = useState(null);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedFrom, setExtractedFrom] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState(false);
  const [createFor, setCreateFor] = useState(null); // { key, name }
  const fileInput = useRef(null);
  const today = todayIso();

  useEffect(() => {
    const pid = params.get('product');
    if (!pid) return;
    getProduct(pid).then((p) => {
      setLines([blankLine(p)]);
      if (p.default_supplier_id) setHeader((h) => ({ ...h, supplier_id: h.supplier_id || p.default_supplier_id }));
    }).catch(() => {});
  }, [params]);

  const setH = (k) => (e) => setHeader({ ...header, [k]: e.target.value });
  const updateLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = (product) => setLines((ls) => {
    const blank = ls.find((l) => !l.product_id && !l.batch_no);
    if (blank && product) return ls.map((l) => (l.key === blank.key ? { ...blankLine(product), key: l.key } : l));
    return [...ls, blankLine(product)];
  });

  const onCode = useCallback(async (code) => {
    setScanOpen(false);
    try {
      const p = await lookupBarcode(pharmacy.id, code);
      if (p) { addLine(p); toast.success(`${p.name} added — enter batch and expiry`); }
      else setCreateFor({ key: null, name: '', barcode: code });
    } catch (e) { toast.error(e.message); }
  }, [pharmacy.id]);
  useBarcodeWedge(onCode, { enabled: !scanOpen && !createFor && !newSupplier });

  const totals = useMemo(() => lines.reduce((t, l) => {
    const x = purchaseLineTotals(l);
    return { taxable: t.taxable + x.taxable, tax: t.tax + x.tax, total: t.total + x.total };
  }, { taxable: 0, tax: 0, total: 0 }), [lines]);

  const filled = lines.filter((l) => l.product_id || l.batch_no || l.quantity);
  const problems = filled.map((l) => lineErrors(l, today));
  const supplier = suppliers.data?.find((s) => s.id === header.supplier_id);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadInvoiceFile(pharmacy.id, file);
      setFilePath(path); setFileName(file.name);
      toast.success('Invoice attached');
    } catch (err) { toast.error(err.message); } finally { setUploading(false); }
  }

  async function runExtraction() {
    setExtracting(true);
    try {
      const draft = await extractInvoice(pharmacy.id, filePath);
      setLines(draft.lines.length ? draft.lines.map((d) => ({
        ...blankLine(), product_id: d.product_id ?? '', product_name: d.matched_name ?? d.product_name,
        batch_no: d.batch_no ?? '', expiry_date: d.expiry_date ?? '', quantity: d.quantity ?? '', free_quantity: d.free_quantity || '',
        purchase_price: d.purchase_price ?? '', mrp: d.mrp ?? '', selling_price: d.mrp ?? '', gst_rate: d.gst_rate ?? 12,
        warnings: d.warnings, extracted_name: d.product_name,
      })) : [blankLine()]);
      const match = draft.supplier_name && suppliers.data?.find((s) => s.name.toLowerCase().includes(draft.supplier_name.toLowerCase().split(' ')[0]));
      setHeader((h) => ({
        ...h, invoice_no: draft.invoice_no || h.invoice_no, invoice_date: draft.invoice_date && draft.invoice_date <= today ? draft.invoice_date : h.invoice_date,
        supplier_id: h.supplier_id || match?.id || '',
      }));
      setExtractedFrom(draft.supplier_name || 'the invoice');
      toast.success(`Read ${draft.lines.length} line(s). Check every line before saving.`);
    } catch (err) { toast.error(err.message); } finally { setExtracting(false); }
  }

  async function submit() {
    setShowErrors(true);
    if (!header.supplier_id || !header.invoice_no.trim() || !filled.length || problems.some((p) => p.length)) {
      toast.error('Fix the highlighted fields first');
      return;
    }
    if (Number(header.amount_paid || 0) > totals.total + 0.01) { toast.error('Amount paid is more than the invoice total'); return; }
    setSaving(true);
    try {
      const p = await receivePurchase({
        pharmacyId: pharmacy.id, branchId: branch.id, supplierId: header.supplier_id, invoiceNo: header.invoice_no.trim(),
        invoiceDate: header.invoice_date, dueDate: header.due_date, items: filled, amountPaid: header.amount_paid,
        paymentMethod: header.payment_method, notes: header.notes, invoiceFilePath: filePath,
      });
      toast.success(`${p.reference_no} saved · ${filled.length} line(s) added to stock`);
      navigate(`/purchases/${p.id}`);
    } catch (err) {
      toast.error(err.message, { duration: 7000 });
    } finally { setSaving(false); }
  }

  const cell = 'px-1.5 py-1.5 align-top';
  return (
    <>
      <PageHeader back={{ to: '/purchases', label: 'Purchases' }} title="Receive stock"
        description={`Into ${branch?.name}. Batches with the same number and expiry are topped up; new ones are created.`}
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/purchases')}>Cancel</Button>
            <Button onClick={submit} loading={saving}>Save purchase</Button>
          </>
        )} />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4 min-w-0">
          <Panel title="Supplier invoice">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <Select label="Supplier" required value={header.supplier_id} onChange={setH('supplier_id')} placeholder="Select supplier"
                  options={(suppliers.data || []).map((s) => ({ value: s.id, label: s.name }))}
                  error={showErrors && !header.supplier_id ? 'Required' : null} />
                <button type="button" onClick={() => setNewSupplier(true)} className="mt-1 text-xs font-medium text-primary hover:underline">+ New supplier</button>
              </div>
              <Input label="Invoice no." required value={header.invoice_no} onChange={setH('invoice_no')} inputClassName="code" error={showErrors && !header.invoice_no.trim() ? 'Required' : null} />
              <Input label="Invoice date" type="date" required max={today} value={header.invoice_date} onChange={setH('invoice_date')} />
            </div>
          </Panel>

          <Panel title="Items" padded={false}
            actions={(
              <>
                <Button size="sm" variant="secondary" icon={ScanLine} onClick={() => setScanOpen(true)}>Scan</Button>
                <Button size="sm" variant="secondary" icon={Plus} onClick={() => addLine()}>Add line</Button>
              </>
            )}>
            {extractedFrom && (
              <div className="p-3"><InlineAlert tone="warning" icon={AlertTriangle} title="Draft read from the uploaded invoice">
                Compare every line with the paper invoice. Nothing is saved until you press “Save purchase”.
              </InlineAlert></div>
            )}
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[1020px] text-[13px]">
                <thead className="border-b border-line text-[11px] uppercase tracking-wide text-ink-3">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th><th className="px-1.5 py-2 text-left">Batch</th><th className="px-1.5 py-2 text-left">Mfg</th>
                    <th className="px-1.5 py-2 text-left">Expiry</th><th className="px-1.5 py-2 text-right">Qty</th><th className="px-1.5 py-2 text-right">Free</th>
                    <th className="px-1.5 py-2 text-right">Rate</th><th className="px-1.5 py-2 text-right">MRP</th><th className="px-1.5 py-2 text-right">Sell at</th>
                    <th className="px-1.5 py-2 text-right">GST</th><th className="px-1.5 py-2 text-right">Amount</th><th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const errs = showErrors && (l.product_id || l.batch_no || l.quantity) ? lineErrors(l, today) : [];
                    const bad = (k) => (errs.includes(k) ? true : undefined);
                    return (
                      <tr key={l.key} className="border-b border-line/70">
                        <td className="px-3 py-1.5 align-top">
                          <ProductPicker key={`${l.key}:${l.product_id}`} pharmacyId={pharmacy.id} value={l.product_id} label={l.product_name}
                            onSelect={(p) => updateLine(l.key, { product_id: p.id, product_name: p.name, gst_rate: Number(p.gst_rate), warnings: l.warnings.filter((w) => !w.startsWith('No matching')) })}
                            onCreate={(name) => setCreateFor({ key: l.key, name })} />
                          {l.extracted_name && l.extracted_name !== l.product_name && <div className="mt-0.5 text-[11px] text-ink-3">Invoice: {l.extracted_name}</div>}
                          {l.warnings?.length > 0 && <div className="mt-0.5 text-[11px] text-warning">{l.warnings.join(' · ')}</div>}
                          {errs.length > 0 && <div className="mt-0.5 text-[11px] text-danger">Check: {errs.join(', ')}</div>}
                        </td>
                        <td className={cell}><BareInput value={l.batch_no} onChange={(e) => updateLine(l.key, { batch_no: e.target.value.toUpperCase() })} className="code h-8 w-24 text-[13px]" aria-label="Batch" aria-invalid={bad('batch')} /></td>
                        <td className={cell}><BareInput type="date" value={l.mfg_date} max={today} onChange={(e) => updateLine(l.key, { mfg_date: e.target.value })} className="h-8 w-[130px] text-[13px]" aria-label="Mfg date" /></td>
                        <td className={cell}><BareInput type="date" value={l.expiry_date} min={today} onChange={(e) => updateLine(l.key, { expiry_date: e.target.value })} className="h-8 w-[130px] text-[13px]" aria-label="Expiry" aria-invalid={bad('expiry') || bad('expired')} /></td>
                        <td className={cell}><BareInput type="number" min="1" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} className="h-8 w-16 text-right num text-[13px]" aria-label="Quantity" aria-invalid={bad('qty')} /></td>
                        <td className={cell}><BareInput type="number" min="0" value={l.free_quantity} onChange={(e) => updateLine(l.key, { free_quantity: e.target.value })} className="h-8 w-14 text-right num text-[13px]" aria-label="Free quantity" /></td>
                        <td className={cell}><BareInput type="number" min="0" step="0.01" value={l.purchase_price} onChange={(e) => updateLine(l.key, { purchase_price: e.target.value })} className="h-8 w-20 text-right num text-[13px]" aria-label="Rate" aria-invalid={bad('rate')} /></td>
                        <td className={cell}><BareInput type="number" min="0" step="0.01" value={l.mrp} onChange={(e) => updateLine(l.key, { mrp: e.target.value, selling_price: l.selling_price === '' || l.selling_price === l.mrp ? e.target.value : l.selling_price })} className="h-8 w-20 text-right num text-[13px]" aria-label="MRP" aria-invalid={bad('MRP')} /></td>
                        <td className={cell}><BareInput type="number" min="0" step="0.01" value={l.selling_price} onChange={(e) => updateLine(l.key, { selling_price: e.target.value })} className="h-8 w-20 text-right num text-[13px]" aria-label="Selling price" aria-invalid={bad('selling ≤ MRP')} /></td>
                        <td className={cell}><BareSelect value={l.gst_rate} onChange={(e) => updateLine(l.key, { gst_rate: Number(e.target.value) })} className="h-8 w-[70px] text-[13px]" aria-label="GST"
                          options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} /></td>
                        <td className="px-1.5 py-2.5 text-right align-top num">{money(purchaseLineTotals(l).total)}</td>
                        <td className="px-1 py-1.5 align-top"><IconButton icon={Trash2} label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Invoice copy" description="Kept privately with the purchase.">
            <input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
            {filePath ? (
              <div className="space-y-3">
                <p className="truncate text-sm text-ink-2" title={fileName}>{fileName}</p>
                {ai.data?.configured ? (
                  <Button variant="soft" icon={Sparkles} className="w-full" onClick={runExtraction} loading={extracting}>Read lines from invoice</Button>
                ) : <p className="text-xs text-ink-3">Automatic reading is available when the assistant is enabled on the server.</p>}
                <button type="button" onClick={() => fileInput.current?.click()} className="text-xs font-medium text-primary hover:underline">Replace file</button>
              </div>
            ) : (
              <Button variant="secondary" icon={uploading ? undefined : FileUp} className="w-full" loading={uploading} onClick={() => fileInput.current?.click()}>Attach PDF or photo</Button>
            )}
            {extracting && <p className="mt-2 flex items-center gap-2 text-xs text-ink-3"><Spinner size={13} /> Reading the invoice — this can take a minute.</p>}
          </Panel>

          <Panel title="Payment">
            <dl className="mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-3">Taxable</dt><dd className="num">{money(totals.taxable)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">GST</dt><dd className="num">{money(totals.tax)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold"><dt>Invoice total</dt><dd className="num">{money(totals.total)}</dd></div>
            </dl>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Paid now" type="number" min="0" step="0.01" prefix="₹" value={header.amount_paid} onChange={setH('amount_paid')} />
                <Select label="Via" value={header.payment_method} onChange={setH('payment_method')} options={PAYMENT_METHODS.filter((m) => m.value !== 'credit')} />
              </div>
              <Input label="Due date" type="date" value={header.due_date} onChange={setH('due_date')}
                hint={supplier ? `Default: invoice date + ${supplier.payment_terms_days} days` : 'Defaults to the supplier’s credit terms'} />
              <Textarea label="Notes" rows={2} value={header.notes} onChange={setH('notes')} />
            </div>
          </Panel>
        </div>
      </div>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onCode} title="Scan to add a line" />
      <QuickSupplierModal open={newSupplier} onClose={() => setNewSupplier(false)} pharmacyId={pharmacy.id}
        onCreated={(s) => { suppliers.reload(); setHeader((h) => ({ ...h, supplier_id: s.id })); }} />
      <ProductFormModal open={Boolean(createFor)} onClose={() => setCreateFor(null)} initialBarcode={createFor?.barcode}
        product={createFor?.name ? { name: createFor.name } : undefined}
        onSaved={(p) => {
          if (createFor?.key) updateLine(createFor.key, { product_id: p.id, product_name: p.name, gst_rate: Number(p.gst_rate) });
          else addLine(p);
          setCreateFor(null);
        }} />
    </>
  );
}
