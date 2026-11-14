import { useState } from 'react';
import toast from 'react-hot-toast';
import { LogOut } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { createPharmacy } from '../services/pharmacy';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { InlineAlert } from '../components/ui/States';

const STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

/** First run for a new owner: create the pharmacy (and its first branch). */
export default function Onboarding() {
  const { profile, refresh, signOut, memberships } = useSession();
  const [form, setForm] = useState({ name: '', phone: profile?.phone || '', gstin: '', address: '', city: '', state: '', branchName: 'Main Store' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const gstinInvalid = form.gstin && !/^[0-9A-Z]{15}$/.test(form.gstin.trim().toUpperCase());

  async function submit(e) {
    e.preventDefault();
    if (gstinInvalid) return;
    setBusy(true); setError(null);
    try {
      await createPharmacy(form);
      await refresh();
      toast.success(`${form.name} is ready`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">PharmaTrack Pro</span>
          <Button variant="ghost" size="sm" icon={LogOut} onClick={signOut}>Sign out</Button>
        </div>
        <h1 className="text-2xl font-semibold text-ink">Set up your pharmacy</h1>
        <p className="mt-1.5 text-sm text-ink-3">
          You'll be the owner. You can add branches and invite staff afterwards.
          {memberships.length === 0 && ' If you were expecting to join an existing pharmacy, ask its owner to invite this email address.'}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-line bg-surface p-5">
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Input label="Pharmacy name" required value={form.name} onChange={set('name')} placeholder="e.g. Shree Medical Store" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} />
            <Input label="GSTIN" value={form.gstin} onChange={set('gstin')} inputClassName="code uppercase" maxLength={15}
              error={gstinInvalid ? 'GSTIN has 15 letters/digits' : null} hint="Printed on tax invoices" />
          </div>
          <Input label="Address" value={form.address} onChange={set('address')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="City" value={form.city} onChange={set('city')} />
            <Input label="State" value={form.state} onChange={set('state')} list="states" />
            <datalist id="states">{STATES.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <Input label="First branch name" value={form.branchName} onChange={set('branchName')} hint="You can rename it or add more later" />
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={form.name.trim().length < 2}>Create pharmacy</Button>
        </form>
      </div>
    </div>
  );
}
