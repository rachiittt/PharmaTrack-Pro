import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, Bell, Boxes, Building2, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Menu,
  Moon, Receipt, Settings, ShieldCheck, ShoppingCart, Sparkles, Sun, Truck, Users, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSession } from '../../context/SessionContext';
import { ROLE_LABELS } from '../../lib/roles';
import { listNotifications, markAllRead, subscribeToPharmacy, unreadCount } from '../../services/notifications';
import { refreshAlertNotifications } from '../../services/insights';
import { timeAgo } from '../../lib/format';
import { Badge } from '../ui/Badge';

const NAV = [
  { label: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view', end: true }] },
  { label: 'Sell', items: [
    { to: '/pos', label: 'Point of sale', icon: ShoppingCart, perm: 'pos.use' },
    { to: '/sales', label: 'Sales & returns', icon: Receipt, perm: 'sales.view' },
  ] },
  { label: 'Stock', items: [
    { to: '/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory.view' },
    { to: '/alerts', label: 'Expiry & stock alerts', icon: AlertTriangle, perm: 'alerts.view' },
    { to: '/purchases', label: 'Purchases', icon: ClipboardList, perm: 'purchases.view' },
    { to: '/suppliers', label: 'Suppliers', icon: Truck, perm: 'suppliers.view' },
  ] },
  { label: 'Insights', items: [
    { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
    { to: '/assistant', label: 'Assistant', icon: Sparkles, perm: 'assistant.use' },
  ] },
  { label: 'Manage', items: [
    { to: '/team', label: 'Staff & roles', icon: Users, perm: 'team.manage' },
    { to: '/settings', label: 'Settings', icon: Settings },
  ] },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('pharmatrack.theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

function Sidebar({ onNavigate }) {
  const { can, isPlatformAdmin, pharmacy, memberships, selectPharmacy, profile, role, signOut } = useSession();
  const navigate = useNavigate();
  const link = ({ isActive }) => `flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors
    ${isActive ? 'bg-sidebar-2 font-medium text-sidebar-ink-strong' : 'hover:bg-white/5 hover:text-sidebar-ink-strong'}`;
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-ink">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-sidebar-ink-strong">PharmaTrack Pro</div>
          <div className="text-[11px] text-sidebar-ink/70">Pharmacy operations</div>
        </div>
      </div>

      {pharmacy && (
        <div className="px-3 pb-2">
          {memberships.length > 1 ? (
            <label className="block">
              <span className="sr-only">Pharmacy</span>
              <select value={pharmacy.id} onChange={(e) => { selectPharmacy(e.target.value); navigate('/'); }}
                className="select-chevron w-full truncate rounded-lg border border-white/10 bg-sidebar-2 py-2 pl-2.5 pr-8 text-[13px] font-medium text-sidebar-ink-strong">
                {memberships.map((m) => <option key={m.pharmacy.id} value={m.pharmacy.id}>{m.pharmacy.name}</option>)}
              </select>
            </label>
          ) : (
            <div className="truncate rounded-lg bg-sidebar-2 px-2.5 py-2 text-[13px] font-medium text-sidebar-ink-strong" title={pharmacy.name}>{pharmacy.name}</div>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto scroll-thin px-3 pb-3" aria-label="Main">
        {pharmacy && NAV.map((group) => {
          const items = group.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={group.label} className="mt-3">
              <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-ink/50">{group.label}</div>
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={link}>
                  <item.icon size={16} aria-hidden />
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
        {isPlatformAdmin && (
          <div className="mt-3">
            <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-ink/50">Platform</div>
            <NavLink to="/platform" onClick={onNavigate} className={link}>
              <ShieldCheck size={16} aria-hidden /> Platform admin
            </NavLink>
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-2 text-xs font-semibold text-sidebar-ink-strong" aria-hidden>
            {(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-sidebar-ink-strong">{profile?.full_name || profile?.email}</div>
            <div className="text-[11px] text-sidebar-ink/70">{ROLE_LABELS[role] ?? (isPlatformAdmin ? 'Platform admin' : '')}</div>
          </div>
          <button type="button" onClick={signOut} className="rounded-md p-1.5 hover:bg-white/5" aria-label="Sign out" title="Sign out">
            <LogOut size={16} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationBell() {
  const { pharmacy, role } = useSession();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const canRefresh = role && role !== 'cashier';

  useEffect(() => {
    if (!pharmacy) return undefined;
    let alive = true;
    const key = `pharmatrack.alerts.${pharmacy.id}`;
    let seen = false;
    try { seen = Boolean(sessionStorage.getItem(key)); } catch { /* ignore */ }
    // Materialise expiry/stock alerts once per browser session per pharmacy.
    const refresh = canRefresh && !seen
      ? refreshAlertNotifications(pharmacy.id).then(() => { try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ } }).catch(() => {})
      : Promise.resolve();
    refresh.then(() => unreadCount(pharmacy.id)).then((n) => alive && setCount(n)).catch(() => {});
    const unsubscribe = subscribeToPharmacy(pharmacy.id, {
      onNotification: (n) => {
        setCount((c) => c + 1);
        if (n.severity === 'critical') toast(n.title, { icon: <AlertTriangle size={16} className="text-danger" aria-hidden /> });
      },
    });
    return () => { alive = false; unsubscribe(); };
  }, [pharmacy, canRefresh]);

  useEffect(() => {
    if (!open || !pharmacy) return undefined;
    listNotifications(pharmacy.id, { limit: 8 }).then(setItems).catch(() => setItems([]));
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open, pharmacy]);

  async function readAll() {
    try {
      await markAllRead(pharmacy.id);
      setCount(0);
      setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch (e) { toast.error(e.message); }
  }

  const dot = { critical: 'bg-danger', warning: 'bg-warning', info: 'bg-info' };
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${count ? `, ${count} unread` : ''}`} aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2">
        <Bell size={18} aria-hidden />
        {count > 0 && <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-on-danger num">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(360px,calc(100vw-24px))] rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {count > 0 && <button type="button" onClick={readAll} className="text-xs font-medium text-primary hover:underline">Mark all read</button>}
          </div>
          <ul className="max-h-[360px] overflow-y-auto scroll-thin">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">You're all caught up.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <Link to={n.link || '/notifications'} onClick={() => setOpen(false)}
                  className={`flex gap-3 px-4 py-2.5 hover:bg-surface-2 ${n.read_at ? 'opacity-70' : ''}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[n.severity] || 'bg-ink-3'}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-ink-3">{n.body}</span>}
                    <span className="block text-[11px] text-ink-3">{timeAgo(n.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-surface-2">View all</Link>
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu }) {
  const { pharmacy, branches, branch, membership, selectBranch } = useSession();
  const [dark, toggleTheme] = useTheme();
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-5">
      <button type="button" onClick={onMenu} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Open menu">
        <Menu size={18} aria-hidden />
      </button>
      {branch && (
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <Building2 size={15} className="shrink-0 text-ink-3" aria-hidden />
          {branches.length > 1 && !membership?.branch_id ? (
            <label className="relative">
              <span className="sr-only">Branch</span>
              <select value={branch.id} onChange={(e) => selectBranch(e.target.value)}
                className="max-w-[180px] appearance-none truncate rounded-md bg-transparent py-1 pl-1 pr-6 font-medium text-ink hover:bg-surface-2">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            </label>
          ) : <span className="truncate font-medium text-ink">{branch.name}</span>}
        </div>
      )}
      {pharmacy?.is_demo && <Badge tone="info" className="ml-1">Demo data</Badge>}
      {pharmacy?.status === 'trial' && <Badge tone="neutral" className="ml-1 hidden sm:inline-flex">Trial</Badge>}
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={toggleTheme} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2"
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
          {dark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
        </button>
        {pharmacy && <NotificationBell />}
      </div>
    </header>
  );
}

export function AppShell() {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const fullBleed = location.pathname.startsWith('/pos');
  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="no-print sticky top-0 hidden h-screen w-[236px] shrink-0 lg:block"><Sidebar /></aside>
      {menu && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenu(false)} aria-hidden />
          <div className="relative h-full w-[260px] max-w-[85vw]">
            <Sidebar onNavigate={() => setMenu(false)} />
            <button type="button" onClick={() => setMenu(false)} className="absolute right-2 top-3 rounded-md p-1.5 text-sidebar-ink hover:bg-white/5" aria-label="Close menu">
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMenu(true)} />
        <main className={`min-w-0 flex-1 ${fullBleed ? '' : 'mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 sm:py-6'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
