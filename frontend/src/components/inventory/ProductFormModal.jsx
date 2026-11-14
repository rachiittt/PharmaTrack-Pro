import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Checkbox, Input, Select, Textarea } from '../ui/Field';
import { CATEGORIES, GST_RATES, SCHEDULES, addOpeningStock, createProduct, updateProduct } from '../../services/inventory';
import { listSuppliers } from '../../services/suppliers';
import { useSession } from '../../context/SessionContext';
import { normalizeScannedCode } from '../../lib/barcode';
import { todayIso } from '../../lib/format';

const EMPTY = {
  name: '', generic_name: '', composition: '', manufacturer: '', barcode: '', category: 'Tablet', schedule: 'OTC',
  hsn_code: '3004', gst_rate: 12, unit: 'strip', pack_size: 10, min_stock_level: 10, rack_location: '', default_supplier_id: '',
};
const EMPTY_BATCH = { batch_no: '', mfg_date: '', expiry_date: '', quantity: '', purchase_price: '', selling_price: '', mrp: '' };

function validate(p, batch, withStock) {
  const e = {};
  if (p.name.trim().length < 2) e.name = 'Enter the product name';
  if (p.barcode && !normalizeScannedCode(p.barcode)) e.barcode = 'Invalid barcode (check digit does not match)';
  if (!(Number(p.min_stock_level) >= 0)) e.min_stock_level = 'Must be 0 or more';
  if (!(Number(p.pack_size) >= 1)) e.pack_size = 'Must be at least 1';
  if (withStock) {
    if (!batch.batch_no.trim()) e.batch_no = 'Required';
    if (!batch.expiry_date) e.expiry_date = 'Required';
    else if (batch.expiry_date <= todayIso()) e.expiry_date = 'Already expired';
    if (batch.mfg_date && batch.expiry_date && batch.mfg_date >= batch.expiry_date) e.mfg_date = 'Must be before expiry';
    if (!(Number.isInteger(Number(batch.quantity)) && Number(batch.quantity) > 0)) e.quantity = 'Whole number above 0';
    if (!(Number(batch.purchase_price) >= 0) || batch.purchase_price === '') e.purchase_price = 'Required';
    if (!(Number(batch.mrp) > 0)) e.mrp = 'Required';
    if (!(Number(batch.selling_price) >= 0) || batch.selling_price === '') e.selling_price = 'Required';
    else if (Number(batch.selling_price) > Number(batch.mrp)) e.selling_price = 'Cannot exceed MRP';
  }
  return e;
}

/**
 * Create or edit a product. New products can optionally get opening stock
 * (one batch) — ongoing stock should come in through Purchases.
 */
export function ProductFormModal(props) {
  if (!props.open) return null;
  return <ProductForm {...props} />;
}

function ProductForm({ open, onClose, product, initialBarcode, onSaved }) {
  const { pharmacy, branch } = useSession();
  const editing = Boolean(product?.id);
  const [form, setForm] = useState(() => (product
    ? { ...EMPTY, ...Object.fromEntries(Object.entries(product).map(([k, v]) => [k, v ?? ''])) }
    : { ...EMPTY, barcode: initialBarcode || '' }));
  const [batch, setBatch] = useState(EMPTY_BATCH);
  const [withStock, setWithStock] = useState(!product);
  const [errors, setErrors] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    listSuppliers(pharmacy.id, { activeOnly: true }).then((s) => alive && setSuppliers(s)).catch(() => {});
    return () => { alive = false; };
  }, [pharmacy.id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setB = (k) => (e) => setBatch({ ...batch, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const errs = validate(form, batch, !editing && withStock);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const payload = {
        ...form,
        barcode: form.barcode ? normalizeScannedCode(form.barcode) : null,
        gst_rate: Number(form.gst_rate), pack_size: Number(form.pack_size), min_stock_level: Number(form.min_stock_level),
        default_supplier_id: form.default_supplier_id || null,
      };
      const saved = editing ? await updateProduct(product.id, payload) : await createProduct(pharmacy.id, payload);
      if (!editing && withStock) {
        try {
          await addOpeningStock({
            productId: saved.id, branchId: branch.id, batchNo: batch.batch_no.trim(), expiryDate: batch.expiry_date,
            mfgDate: batch.mfg_date, quantity: batch.quantity, purchasePrice: batch.purchase_price,
            sellingPrice: batch.selling_price, mrp: batch.mrp, supplierId: payload.default_supplier_id,
          });
        } catch (err) {
          toast.error(`Product saved, but opening stock failed: ${err.message}`);
          onSaved?.(saved);
          onClose();
          return;
        }
      }
      toast.success(editing ? 'Product updated' : `${saved.name} added`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err.code === '23505') setErrors({ barcode: 'Another product already uses this barcode' });
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? `Edit ${product.name}` : 'Add product'}
      description={editing ? 'Catalogue details. Prices and stock are managed per batch.' : 'Catalogue details, plus optional opening stock for this branch.'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="product-form" loading={busy}>{editing ? 'Save changes' : 'Add product'}</Button></>}>
      <form id="product-form" onSubmit={submit} className="space-y-6" noValidate>
        <section className="grid gap-4 sm:grid-cols-2">
          <Input label="Brand / product name" required value={form.name} onChange={set('name')} error={errors.name} className="sm:col-span-2" placeholder="e.g. Dolo 650 Tablet" />
          <Input label="Generic name" value={form.generic_name} onChange={set('generic_name')} placeholder="e.g. Paracetamol" />
          <Input label="Manufacturer" value={form.manufacturer} onChange={set('manufacturer')} />
          <Textarea label="Composition" rows={2} value={form.composition} onChange={set('composition')} className="sm:col-span-2" placeholder="e.g. Paracetamol 650 mg" />
          <Input label="Barcode" value={form.barcode} onChange={set('barcode')} error={errors.barcode} inputClassName="code" data-scan-target="true" hint="EAN/UPC from the pack, or your own code" />
          <Select label="Category" value={form.category} onChange={set('category')} options={CATEGORIES} />
          <Select label="Schedule" value={form.schedule} onChange={set('schedule')} options={SCHEDULES} hint="H / H1 / X require a prescription at billing" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="GST %" value={form.gst_rate} onChange={set('gst_rate')} options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
            <Input label="HSN code" value={form.hsn_code} onChange={set('hsn_code')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Unit" value={form.unit} onChange={set('unit')} hint="strip, bottle, tube…" />
            <Input label="Pack size" type="number" min="1" value={form.pack_size} onChange={set('pack_size')} error={errors.pack_size} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Minimum stock" type="number" min="0" value={form.min_stock_level} onChange={set('min_stock_level')} error={errors.min_stock_level} hint="Low-stock alert below this" />
            <Input label="Rack / shelf" value={form.rack_location} onChange={set('rack_location')} placeholder="A1" />
          </div>
          <Select label="Usual supplier" value={form.default_supplier_id} onChange={set('default_supplier_id')} placeholder="—"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))} className="sm:col-span-2" />
        </section>

        {!editing && (
          <section className="rounded-lg border border-line p-4">
            <Checkbox checked={withStock} onChange={(e) => setWithStock(e.target.checked)} label={`Add opening stock to ${branch?.name ?? 'this branch'}`}
              description="Use for stock already on your shelves. New deliveries should be entered under Purchases." />
            {withStock && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Input label="Batch no." required value={batch.batch_no} onChange={setB('batch_no')} error={errors.batch_no} inputClassName="code uppercase" />
                <Input label="Mfg date" type="date" value={batch.mfg_date} onChange={setB('mfg_date')} error={errors.mfg_date} />
                <Input label="Expiry date" type="date" required value={batch.expiry_date} onChange={setB('expiry_date')} error={errors.expiry_date} />
                <Input label="Quantity" type="number" min="1" required value={batch.quantity} onChange={setB('quantity')} error={errors.quantity} />
                <Input label="Purchase price" type="number" min="0" step="0.01" prefix="₹" required value={batch.purchase_price} onChange={setB('purchase_price')} error={errors.purchase_price} />
                <Input label="MRP" type="number" min="0" step="0.01" prefix="₹" required value={batch.mrp} onChange={setB('mrp')} error={errors.mrp} />
                <Input label="Selling price (incl. GST)" type="number" min="0" step="0.01" prefix="₹" required value={batch.selling_price} onChange={setB('selling_price')} error={errors.selling_price} className="sm:col-span-2" />
              </div>
            )}
          </section>
        )}
      </form>
    </Modal>
  );
}
