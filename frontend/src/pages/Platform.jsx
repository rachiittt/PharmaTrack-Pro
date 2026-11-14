import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { useAsync } from '../hooks/useAsync';
import { platformOverview, platformUpdatePharmacy } from '../services/pharmacy';
import { moneyCompact, number, date, timeAgo } from '../lib/format';
import { BareInput, BareSelect } from '../components/ui/Field';
import { Panel } from '../components/ui/Panel';
import { DataTable } from '../components/ui/DataTable';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageHeader, Stat } from '../components/ui/Misc';
import { Badge } from '../components/ui/Badge';
import { ErrorState, PageLoader } from '../components/ui/States';

const STATUS_TONE = { active: 'success', trial: 'info', suspended: 'danger' };
const PLANS = ['free', 'starter', 'pro', 'enterprise'];

/** Platform super-admin. Every call is re-checked by private.require_platform_admin(). */
export default function Platform() {
  const { data, error, reload } = useAsync(platformOverview, []);
  const [search, setSearch] = useState('');
  const [suspending, setSuspending] = useState(null);

  const tenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.tenants || []).filter((t) => !q || t.name.toLowerCase().includes(q) || (t.owner_email || '').toLowerCase().includes(q) || (t.city || '').toLowerCase().includes(q));
  }, [data, search]);

  async function update(t, patch, message) {
    try { await platformUpdatePharmacy(t.id, patch); toast.success(message); reload(); } catch (e) { toast.error(e.message); }
  }

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageLoader />;

  return (
    <>
      <PageHeader title="Platform administration" description="All pharmacies on PharmaTrack. Demo tenants are excluded from totals." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pharmacies" value={number(data.pharmacies.total)} sub={`${data.pharmacies.new_30d} new in 30 days`} tone="primary" />
        <Stat label="Active / trial" value={`${data.pharmacies.active} / ${data.pharmacies.trial}`} sub={`${data.pharmacies.suspended} suspended`} />
        <Stat label="Platform GMV · 30 days" value={moneyCompact(data.sales_30d.gmv)} sub={`${number(data.sales_30d.bills)} bills`} />
        <Stat label="Users" value={number(data.users)} sub={`${number(data.ai_requests_30d)} assistant requests (30d)`} />
      </div>

      <Panel className="mt-4" title="Pharmacies" padded={false}
        actions={(
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <BareInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, owner, city" className="h-8 w-56 pl-8 text-[13px]" aria-label="Search pharmacies" />
          </div>
        )}>
        <DataTable rows={tenants} columns={[
          { key: 'name', header: 'Pharmacy', render: (t) => <div><span className="font-medium">{t.name}</span>{t.is_demo && <Badge tone="info" className="ml-2">Demo</Badge>}<div className="text-xs text-ink-3">{[t.owner_email, t.city].filter(Boolean).join(' · ')}</div></div> },
          { key: 'status', header: 'Status', render: (t) => <Badge tone={STATUS_TONE[t.status]} dot>{t.status}</Badge> },
          { key: 'plan', header: 'Plan', render: (t) => (
            <BareSelect value={t.plan} aria-label={`Plan for ${t.name}`} className="h-8 w-32 text-[13px]"
              onChange={(e) => update(t, { plan: e.target.value }, `Plan changed to ${e.target.value}`)} options={PLANS} />
          ) },
          { key: 'usage', header: 'Usage', hideBelow: 'md', render: (t) => <span className="text-xs text-ink-2">{t.members} staff · {t.branches} branches · {number(t.products)} products</span> },
          { key: 'last_sale', header: 'Last sale', hideBelow: 'lg', render: (t) => (t.last_sale_at ? timeAgo(t.last_sale_at) : '—') },
          { key: 'created', header: 'Joined', hideBelow: 'lg', render: (t) => date(t.created_at) },
          { key: 'act', header: '', render: (t) => (t.status === 'suspended'
            ? <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => update(t, { status: 'active', reason: 'Reactivated' }, `${t.name} reactivated`)}>Reactivate</button>
            : <button type="button" className="text-xs font-medium text-danger hover:underline" onClick={() => setSuspending(t)}>Suspend</button>) },
        ]} />
      </Panel>

      <Panel className="mt-4" title="Recent platform activity" padded={false}>
        <ul className="divide-y divide-line text-sm">
          {data.recent_activity.length === 0 && <li className="px-4 py-6 text-center text-ink-3">No activity yet.</li>}
          {data.recent_activity.map((a, i) => (
            <li key={i} className="flex justify-between gap-3 px-4 py-2.5"><span>{a.action.replace('.', ' · ')} <span className="text-ink-3">— {a.pharmacy || 'deleted pharmacy'}</span></span><span className="text-xs text-ink-3">{timeAgo(a.created_at)}</span></li>
          ))}
        </ul>
      </Panel>

      <ConfirmDialog open={Boolean(suspending)} onClose={() => setSuspending(null)} title={`Suspend ${suspending?.name}?`} confirmLabel="Suspend" requireReason
        onConfirm={async (reason) => { await update(suspending, { status: 'suspended', reason }, `${suspending.name} suspended`); setSuspending(null); }}>
        All staff of this pharmacy lose access immediately (enforced by the database). Their data is kept and access returns when reactivated.
      </ConfirmDialog>
    </>
  );
}
