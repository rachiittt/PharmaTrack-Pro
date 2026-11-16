import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { createBranch, updateBranch, updatePharmacy, updateProfile } from '../services/pharmacy';
import { supabase } from '../lib/supabase';
import { ROLE_LABELS } from '../lib/roles';
import { Button } from '../components/ui/Button';
import { Checkbox, Input } from '../components/ui/Field';
import { Panel } from '../components/ui/Panel';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/Misc';
import { Badge } from '../components/ui/Badge';

function Section({ id, title, description, children, footer }) {
  return (
    <section id={id} className="grid gap-4 border-b border-line py-6 last:border-0 lg:grid-cols-[260px_1fr]">
      <div><h2 className="text-sm font-semibold text-ink">{title}</h2>{description && <p className="mt-1 text-sm text-ink-3">{description}</p>}</div>
      <div className="min-w-0 space-y-4">{children}{footer && <div className="flex justify-end gap-2">{footer}</div>}</div>
    </section>
  );
}

function ProfileSection() {
  const { profile, refresh, role } = useSession();
  const [form, setForm] = useState({ full_name: profile?.full_name || '', phone: profile?.phone || '' });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await updateProfile(profile.id, form); await refresh(); toast.success('Profile saved'); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function changePassword() {
    if (password.length < 8) { toast.error('Use at least 8 characters'); return; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(error.message); else { toast.success('Password changed'); setPassword(''); }
  }
  return (
    <Section title="Your profile" description={<>Signed in as {profile?.email}{role && <> · <Badge>{ROLE_LABELS[role]}</Badge></>}</>}
      footer={<Button onClick={save} loading={busy}>Save profile</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <Input label="Mobile" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div className="flex items-end gap-2">
        <Input label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1" />
        <Button variant="secondary" onClick={changePassword} disabled={!password}>Change</Button>
      </div>
    </Section>
  );
}

function PharmacySection() {
  const { pharmacy, refresh } = useSession();
  const [form, setForm] = useState(pharmacy);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try { await updatePharmacy(pharmacy.id, form); await refresh(); toast.success('Pharmacy details saved'); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <Section title="Pharmacy" description="Printed on every invoice." footer={<Button onClick={save} loading={busy}>Save details</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Trading name" value={form.name || ''} onChange={set('name')} />
        <Input label="Legal name" value={form.legal_name || ''} onChange={set('legal_name')} />
        <Input label="GSTIN" value={form.gstin || ''} onChange={set('gstin')} inputClassName="code uppercase" maxLength={15} />
        <Input label="Drug licence no." value={form.drug_license_no || ''} onChange={set('drug_license_no')} />
        <Input label="Phone" value={form.phone || ''} onChange={set('phone')} />
        <Input label="Email" type="email" value={form.email || ''} onChange={set('email')} />
        <Input label="Address" value={form.address || ''} onChange={set('address')} className="sm:col-span-2" />
        <Input label="City" value={form.city || ''} onChange={set('city')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="State" value={form.state || ''} onChange={set('state')} />
          <Input label="PIN" value={form.pincode || ''} onChange={set('pincode')} />
        </div>
      </div>
    </Section>
  );
}

const THRESHOLDS = [
  ['expiry_warning_days', 'Expiry warning (days)', 'Batches expiring within this many days are flagged'],
  ['expiry_critical_days', 'Expiry critical (days)', 'Shown in red; must be ≤ warning'],
  ['slow_moving_days', 'Slow moving after (days)', 'No sale for this long'],
  ['dead_stock_days', 'Dead stock after (days)', 'No sale for this long'],
  ['max_discount_pct', 'Max discount — managers & pharmacists (%)', ''],
  ['cashier_max_discount_pct', 'Max discount — cashiers (%)', 'Must be ≤ the manager limit'],
];

function AlertsSection() {
  const { pharmacy, refresh } = useSession();
  const [s, setS] = useState(pharmacy.settings);
  const [busy, setBusy] = useState(false);
  async function save() {
    const next = { ...s };
    for (const [k] of THRESHOLDS) next[k] = Number(next[k]);
    next.invoice_prefix = String(next.invoice_prefix || 'INV').toUpperCase();
    setBusy(true);
    try { await updatePharmacy(pharmacy.id, { settings: next }); await refresh(); toast.success('Settings saved'); }
    catch (e) { toast.error(e.code === '22023' ? 'Check the values: critical ≤ warning, cashier discount ≤ manager discount, prefix A–Z/0–9.' : e.message); }
    finally { setBusy(false); }
  }
  return (
    <Section id="alerts" title="Alerts, discounts & billing" description="Applied to alerts, the dashboard and every bill." footer={<Button onClick={save} loading={busy}>Save settings</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {THRESHOLDS.map(([k, label, hint]) => (
          <Input key={k} label={label} hint={hint} type="number" min="0" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
        ))}
        <Input label="Invoice prefix" value={s.invoice_prefix} onChange={(e) => setS({ ...s, invoice_prefix: e.target.value })} inputClassName="code uppercase" maxLength={10} hint="e.g. INV → INV/2026-27/00001" />
      </div>
      <Checkbox checked={s.prices_include_tax !== false} onChange={(e) => setS({ ...s, prices_include_tax: e.target.checked })}
        label="Selling prices include GST" description="Standard for MRP-based retail. Turn off only if you price before tax." />
    </Section>
  );
}

function BranchesSection() {
  const { pharmacy, branches, refresh } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try { await createBranch(pharmacy.id, { name: name.trim() }); setName(''); await refresh(); toast.success('Branch added'); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  const [renaming, setRenaming] = useState(null); // { branch, name }
  const [renameBusy, setRenameBusy] = useState(false);
  async function rename(e) {
    e.preventDefault();
    const next = renaming.name.trim();
    if (next === renaming.branch.name) { setRenaming(null); return; }
    setRenameBusy(true);
    try { await updateBranch(renaming.branch.id, { name: next }); await refresh(); toast.success(`Branch renamed to ${next}`); setRenaming(null); }
    catch (err) { toast.error(err.message); } finally { setRenameBusy(false); }
  }
  return (
    <Section title="Branches" description="Stock, bills and purchases are kept per branch.">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span>{b.name} {b.is_default && <Badge className="ml-1">Default</Badge>}</span>
            <Button size="xs" variant="ghost" onClick={() => setRenaming({ branch: b, name: b.name })}>Rename</Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input label="New branch" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" placeholder="e.g. Sector 21" />
        <Button icon={Plus} variant="secondary" className="self-end" onClick={add} loading={busy} disabled={name.trim().length < 2}>Add</Button>
      </div>
      <Modal open={Boolean(renaming)} onClose={() => (renameBusy ? undefined : setRenaming(null))} title="Rename branch" size="sm"
        description={renaming ? `Currently “${renaming.branch.name}”. The new name appears on bills and in the branch switcher.` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)} disabled={renameBusy}>Cancel</Button>
            <Button type="submit" form="rename-branch-form" loading={renameBusy} disabled={(renaming?.name.trim().length ?? 0) < 2}>Save name</Button>
          </>
        )}>
        <form id="rename-branch-form" onSubmit={rename}>
          <Input label="Branch name" required value={renaming?.name ?? ''} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} data-autofocus />
        </form>
      </Modal>
    </Section>
  );
}

export default function Settings() {
  const { can, pharmacy } = useSession();
  return (
    <>
      <PageHeader title="Settings" />
      <Panel>
        <ProfileSection />
        {pharmacy && can('settings.pharmacy') && <><PharmacySection key={`p${pharmacy.updated_at}`} /><AlertsSection key={`a${pharmacy.updated_at}`} /><BranchesSection /></>}
        {pharmacy && !can('settings.pharmacy') && (
          <Section title="Pharmacy settings" description="Only the owner can change pharmacy details, thresholds and branches." />
        )}
      </Panel>
    </>
  );
}
