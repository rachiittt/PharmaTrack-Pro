import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, Truck } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { listSuppliers, supplierSummary, createSupplier, updateSupplier } from '../services/suppliers';
import { money, date } from '../lib/format';
import { Button } from '../components/ui/Button';
import { BareInput, Checkbox, Input, Textarea } from '../components/ui/Field';
import { DataTable } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { PageHeader, Stat } from '../components/ui/Misc';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState } from '../components/ui/States';

const EMPTY = { name: '', contact_person: '', phone: '', email: '', gstin: '', drug_license_no: '', address: '', payment_terms_days: 30, notes: '', is_active: true };

function SupplierForm({ supplier, onClose, onSaved }) {
  const { pharmacy } = useSession();
  const [form, setForm] = useState(() => (supplier ? { ...EMPTY, ...Object.fromEntries(Object.entries(supplier).map(([k, v]) => [k, v ?? ''])) } : EMPTY));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const gstinBad = form.gstin && !/^[0-9A-Z]{15}$/.test(form.gstin.trim().toUpperCase());
  async function submit(e) {
    e.preventDefault();
    if (gstinBad) return;
    setBusy(true);
    try {
      const saved = supplier ? await updateSupplier(supplier.id, form) : await createSupplier(pharmacy.id, form);
      toast.success(supplier ? 'Supplier updated' : 'Supplier added');
      onSaved(saved); onClose();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={supplier ? `Edit ${supplier.name}` : 'Add supplier'} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="supplier-form" loading={busy}>Save</Button></>}>
      <form id="supplier-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" required value={form.name} onChange={set('name')} className="sm:col-span-2" />
        <Input label="Contact person" value={form.contact_person} onChange={set('contact_person')} />
        <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} />
        <Input label="Email" type="email" value={form.email} onChange={set('email')} />
        <Input label="Credit days" type="number" min="0" max="365" value={form.payment_terms_days} onChange={set('payment_terms_days')} hint="Used for invoice due dates" />
        <Input label="GSTIN" value={form.gstin} onChange={set('gstin')} inputClassName="code uppercase" maxLength={15} error={gstinBad ? '15 letters/digits' : null} />
        <Input label="Drug licence no." value={form.drug_license_no} onChange={set('drug_license_no')} />
        <Textarea label="Address" rows={2} value={form.address} onChange={set('address')} className="sm:col-span-2" />
        <Textarea label="Notes" rows={2} value={form.notes} onChange={set('notes')} className="sm:col-span-2" />
        {supplier && <Checkbox checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} label="Active" description="Inactive suppliers are hidden when entering purchases." />}
      </form>
    </Modal>
  );
}

export default function Suppliers() {
  const { pharmacy, can } = useSession();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // supplier | 'new' | null
  const list = useAsync(() => listSuppliers(pharmacy.id), [pharmacy.id]);
  const summary = useAsync(() => supplierSummary(pharmacy.id), [pharmacy.id]);
  const reload = () => { list.reload(); summary.reload(); };

  const rows = useMemo(() => {
    const byId = Object.fromEntries((summary.data || []).map((s) => [s.supplier_id, s]));
    const q = search.trim().toLowerCase();
    return (list.data || [])
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.contact_person || '').toLowerCase().includes(q) || (s.phone || '').includes(q))
      .map((s) => ({ ...s, ...(byId[s.id] || {}) }));
  }, [list.data, summary.data, search]);

  const outstanding = (summary.data || []).reduce((a, s) => a + Number(s.outstanding), 0);
  const overdue = (summary.data || []).reduce((a, s) => a + Number(s.overdue), 0);

  return (
    <>
      <PageHeader title="Suppliers" description="Distributors you buy from, and what you owe them"
        actions={can('suppliers.edit') && <Button icon={Plus} onClick={() => setEditing('new')}>Add supplier</Button>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Suppliers" value={(list.data || []).filter((s) => s.is_active).length} sub="active" />
        <Stat label="Outstanding" value={money(outstanding)} tone={outstanding ? 'warning' : undefined} sub="unpaid purchase invoices" />
        <Stat label="Overdue" value={money(overdue)} tone={overdue ? 'danger' : undefined} sub="past due date" />
      </div>
      <div className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line p-3">
          <div className="relative max-w-md">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <BareInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, contact or phone" className="pl-9" aria-label="Search suppliers" />
          </div>
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={reload} /> : (
          <DataTable
            loading={list.loading}
            rows={rows}
            onRowClick={can('suppliers.edit') ? (s) => setEditing(s) : undefined}
            columns={[
              { key: 'name', header: 'Supplier', render: (s) => (
                <div><span className="font-medium">{s.name}</span>{!s.is_active && <Badge className="ml-2">Inactive</Badge>}
                  <div className="text-xs text-ink-3">{[s.contact_person, s.phone].filter(Boolean).join(' · ') || '—'}</div></div>
              ) },
              { key: 'gstin', header: 'GSTIN', hideBelow: 'lg', render: (s) => <span className="code text-ink-2">{s.gstin || '—'}</span> },
              { key: 'terms', header: 'Credit', align: 'right', hideBelow: 'md', render: (s) => `${s.payment_terms_days}d` },
              { key: 'purchases', header: 'Purchases', align: 'right', hideBelow: 'sm', render: (s) => s.purchases ?? 0 },
              { key: 'purchased_total', header: 'Bought', align: 'right', hideBelow: 'md', render: (s) => money(s.purchased_total) },
              { key: 'outstanding', header: 'Outstanding', align: 'right', render: (s) => (Number(s.outstanding) > 0
                ? <button type="button" className={`num hover:underline ${Number(s.overdue) > 0 ? 'text-danger' : 'text-warning'}`} onClick={(e) => { e.stopPropagation(); navigate(`/purchases?status=unpaid`); }}>{money(s.outstanding)}</button>
                : <span className="text-ink-3">—</span>) },
              { key: 'last', header: 'Last purchase', hideBelow: 'lg', render: (s) => date(s.last_purchase_on) },
            ]}
            empty={<EmptyState icon={Truck} title={search ? 'No suppliers match' : 'No suppliers yet'}
              action={!search && can('suppliers.edit') && <Button icon={Plus} onClick={() => setEditing('new')}>Add supplier</Button>} />}
          />
        )}
      </div>
      {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}
