import { useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, Users } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { inviteMember, listAuditLog, listMembers, updateMember } from '../services/pharmacy';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../lib/roles';
import { dateTime, date, money } from '../lib/format';
import { Button } from '../components/ui/Button';
import { BareSelect, Checkbox, Input, Select } from '../components/ui/Field';
import { Panel } from '../components/ui/Panel';
import { DataTable } from '../components/ui/DataTable';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/Misc';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, InlineAlert } from '../components/ui/States';

const ROLES = ['manager', 'pharmacist', 'cashier'];

function InviteModal({ onClose, onDone }) {
  const { pharmacy, branches } = useSession();
  const [form, setForm] = useState({ email: '', full_name: '', role: 'cashier', branch_id: '', usePassword: false, temporary_password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await inviteMember(pharmacy.id, {
        email: form.email.trim(), full_name: form.full_name.trim(), role: form.role, branch_id: form.branch_id || null,
        ...(form.usePassword && { temporary_password: form.temporary_password }),
      });
      toast.success(res.invited ? `Invitation emailed to ${form.email}` : `${form.full_name} added as ${ROLE_LABELS[form.role]}`);
      onDone(); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Add staff member" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="invite-form" loading={busy}>Add member</Button></>}>
      <form id="invite-form" onSubmit={submit} className="space-y-4">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" required value={form.full_name} onChange={set('full_name')} />
          <Input label="Email" type="email" required value={form.email} onChange={set('email')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Role" value={form.role} onChange={set('role')} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} hint={ROLE_DESCRIPTIONS[form.role]} />
          <Select label="Branch" value={form.branch_id} onChange={set('branch_id')} placeholder="All branches"
            options={branches.map((b) => ({ value: b.id, label: b.name }))} hint="Pin cashiers to the counter they work at" />
        </div>
        <Checkbox checked={form.usePassword} onChange={(e) => setForm({ ...form, usePassword: e.target.checked })}
          label="Set a temporary password instead of emailing an invite" description="Share it in person; they can change it under Settings." />
        {form.usePassword && <Input label="Temporary password" type="text" minLength={10} required value={form.temporary_password} onChange={set('temporary_password')} hint="At least 10 characters" />}
      </form>
    </Modal>
  );
}

const ACTION_LABELS = {
  'sale.create': 'Bill created', 'sale.cancel': 'Bill cancelled', 'sale.return': 'Return', 'purchase.receive': 'Stock received',
  'purchase.payment': 'Supplier payment', 'stock.adjust': 'Stock adjusted', 'stock.opening': 'Opening stock', 'member.invite': 'Staff added',
  'pharmacy.create': 'Pharmacy created', insert: 'Created', update: 'Updated', delete: 'Deleted',
};

export default function Team() {
  const { pharmacy, branches, user } = useSession();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(null);
  const members = useAsync(() => listMembers(pharmacy.id), [pharmacy.id]);
  const audit = useAsync(() => listAuditLog(pharmacy.id, 60), [pharmacy.id]);

  async function change(member, patch, message) {
    try { await updateMember(member.id, patch); toast.success(message); members.reload(); audit.reload(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <PageHeader title="Staff & roles" description="Who can sign in to this pharmacy, and what they can do"
        actions={<Button icon={UserPlus} onClick={() => setInviting(true)}>Add staff</Button>} />
      <Panel padded={false}>
        {members.error ? <ErrorState error={members.error} onRetry={members.reload} /> : (
          <DataTable loading={members.loading} rows={members.data}
            rowClassName={(m) => (m.is_active ? '' : 'opacity-55')}
            columns={[
              { key: 'name', header: 'Name', render: (m) => (
                <div><span className="font-medium">{m.profile?.full_name || m.profile?.email}</span>{m.user_id === user.id && <Badge className="ml-2">You</Badge>}
                  <div className="text-xs text-ink-3">{m.profile?.email}</div></div>
              ) },
              { key: 'role', header: 'Role', render: (m) => (m.role === 'owner' || m.user_id === user.id
                ? <Badge tone="primary">{ROLE_LABELS[m.role]}</Badge>
                : <BareSelect value={m.role} aria-label={`Role for ${m.profile?.full_name}`} className="h-8 w-36 text-[13px]"
                  onChange={(e) => change(m, { role: e.target.value }, `Role changed to ${ROLE_LABELS[e.target.value]}`)}
                  options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />) },
              { key: 'branch', header: 'Branch', hideBelow: 'sm', render: (m) => (m.role === 'owner'
                ? <span className="text-ink-3">All</span>
                : <BareSelect value={m.branch_id || ''} aria-label="Branch" className="h-8 w-40 text-[13px]"
                  onChange={(e) => change(m, { branch_id: e.target.value || null }, 'Branch updated')}
                  options={[{ value: '', label: 'All branches' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />) },
              { key: 'since', header: 'Added', hideBelow: 'md', render: (m) => date(m.created_at) },
              { key: 'status', header: '', render: (m) => (m.role === 'owner' ? null : m.is_active
                ? <Button size="xs" variant="ghost" onClick={() => setRemoving(m)}>Deactivate</Button>
                : <Button size="xs" variant="ghost" onClick={() => change(m, { is_active: true }, 'Access restored')}>Reactivate</Button>) },
            ]}
            empty={<EmptyState icon={Users} title="Only you so far" action={<Button icon={UserPlus} onClick={() => setInviting(true)}>Add staff</Button>} />} />
        )}
      </Panel>

      <Panel className="mt-4" title="Activity log" description="Recent changes by anyone in this pharmacy" padded={false}>
        <DataTable loading={audit.loading} rows={audit.data} columns={[
          { key: 'created_at', header: 'When', render: (a) => <span className="whitespace-nowrap text-ink-2">{dateTime(a.created_at)}</span> },
          { key: 'who', header: 'Who', render: (a) => a.profiles?.full_name || 'System' },
          { key: 'action', header: 'Action', render: (a) => <span>{ACTION_LABELS[a.action] ?? a.action} <span className="text-ink-3">· {a.entity.replace(/_/g, ' ')}</span></span> },
          { key: 'detail', header: 'Detail', hideBelow: 'md', render: (a) => (
            <span className="block max-w-[420px] truncate text-xs text-ink-3">
              {a.details?.invoice_no || a.details?.reference_no || a.details?.reason || a.details?.name || a.details?.email || ''}
              {a.details?.total != null && ` · ${money(a.details.total)}`}
            </span>
          ) },
        ]} empty={<EmptyState compact title="No activity yet" />} />
      </Panel>

      {inviting && <InviteModal onClose={() => setInviting(false)} onDone={() => { members.reload(); audit.reload(); }} />}
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} title={`Deactivate ${removing?.profile?.full_name}?`} confirmLabel="Deactivate"
        onConfirm={async () => { await change(removing, { is_active: false }, 'Access removed'); setRemoving(null); }}>
        They will be signed out of this pharmacy immediately. Their past bills and changes stay in the records.
      </ConfirmDialog>
    </>
  );
}
