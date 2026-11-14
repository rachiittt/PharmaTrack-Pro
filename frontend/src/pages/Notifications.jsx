import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BellOff, RefreshCw } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { listNotifications, markAllRead, markRead } from '../services/notifications';
import { refreshAlertNotifications } from '../services/insights';
import { timeAgo } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { PageHeader, Segmented } from '../components/ui/Misc';
import { EmptyState, ErrorState, PageLoader } from '../components/ui/States';

const DOT = { critical: 'bg-danger', warning: 'bg-warning', info: 'bg-info' };

export default function Notifications() {
  const { pharmacy, role } = useSession();
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, reload } = useAsync(() => listNotifications(pharmacy.id, { unreadOnly: filter === 'unread', limit: 100 }), [pharmacy.id, filter]);

  async function refresh() {
    setRefreshing(true);
    try { const n = await refreshAlertNotifications(pharmacy.id); toast.success(n ? `${n} new alert(s)` : 'No new alerts'); reload(); }
    catch (e) { toast.error(e.message); } finally { setRefreshing(false); }
  }

  return (
    <>
      <PageHeader title="Notifications"
        actions={(
          <>
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} />
            {role !== 'cashier' && <Button variant="secondary" icon={RefreshCw} onClick={refresh} loading={refreshing}>Check stock now</Button>}
            <Button variant="secondary" onClick={async () => { await markAllRead(pharmacy.id).catch((e) => toast.error(e.message)); reload(); }}>Mark all read</Button>
          </>
        )} />
      <Panel padded={false}>
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <PageLoader /> : data.length === 0 ? (
          <EmptyState icon={BellOff} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}>
            Expiry, stock and payment alerts appear here when they need attention.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.map((n) => (
              <li key={n.id} className={`flex gap-3 px-4 py-3 ${n.read_at ? '' : 'bg-primary-soft/40'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[n.severity] || 'bg-ink-3'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{n.link ? <Link to={n.link} className="hover:underline" onClick={() => !n.read_at && markRead([n.id])}>{n.title}</Link> : n.title}</p>
                  {n.body && <p className="text-sm text-ink-3">{n.body}</p>}
                </div>
                <span className="shrink-0 text-xs text-ink-3">{timeAgo(n.created_at)}</span>
                {!n.read_at && <button type="button" className="shrink-0 text-xs font-medium text-primary hover:underline" onClick={async () => { await markRead([n.id]); reload(); }}>Mark read</button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
