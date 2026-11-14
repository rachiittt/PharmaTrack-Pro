import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { daysUntil, expiryShort, relativeDays } from '../../lib/format';

export function PageHeader({ title, description, actions, back, meta }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink">
            <ArrowLeft size={13} aria-hidden /> {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const CHIP = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  caution: 'bg-caution-soft text-caution',
  info: 'bg-info-soft text-info',
};

/** Segmented control with optional counts — used for status filters. */
export function Segmented({ options, value, onChange, size = 'md', className = '' }) {
  return (
    <div role="tablist" className={`inline-flex max-w-full overflow-x-auto scroll-thin rounded-lg border border-line bg-surface-2 p-0.5 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors
              ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]'}
              ${active ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}
          >
            {o.label}
            {o.count != null && (
              <span className={`num rounded px-1 text-[11px] ${o.count > 0 && o.tone ? CHIP[o.tone] : active ? 'bg-surface-3 text-ink-2' : 'text-ink-3'}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** KPI figure. `tone` colours the accent rule; `trend` is a % change. */
export function Stat({ label, value, sub, tone, trend, to, icon: Icon }) {
  const accent = { danger: 'before:bg-danger', warning: 'before:bg-warning', success: 'before:bg-success', primary: 'before:bg-primary' }[tone] || 'before:bg-transparent';
  const body = (
    <div className={`relative h-full rounded-xl border border-line bg-surface px-4 py-3.5 before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r ${accent}
      ${to ? 'transition-colors hover:border-line-strong' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-3">{label}</span>
        {Icon && <Icon size={15} className="text-ink-3" aria-hidden />}
      </div>
      <div className="mt-1.5 text-[22px] font-semibold leading-tight text-ink num">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
        {trend != null && Number.isFinite(trend) && (
          <span className={`inline-flex items-center font-medium ${trend >= 0 ? 'text-success' : 'text-danger'}`}>
            {trend >= 0 ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
        {sub}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block h-full focus:outline-none">{body}</Link> : body;
}

/**
 * Expiry runway: how much shelf life a batch has left, on a one-year scale,
 * coloured by the pharmacy's own thresholds.
 */
export function ExpiryBar({ date, criticalDays = 30, warningDays = 90, compact = false }) {
  const days = daysUntil(date);
  if (days == null) return <span className="text-ink-3">—</span>;
  const tone = days < 0 ? 'danger' : days <= criticalDays ? 'danger' : days <= warningDays ? 'warning' : 'success';
  const pct = days < 0 ? 100 : Math.max(4, Math.min(100, (days / 365) * 100));
  const bar = { danger: 'bg-danger', warning: 'bg-warning', success: 'bg-success' }[tone];
  const text = { danger: 'text-danger', warning: 'text-warning', success: 'text-ink-2' }[tone];
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'min-w-[150px]'}`} title={days < 0 ? `Expired ${-days} days ago` : `${days} days left`}>
      <span className={`code num w-[52px] shrink-0 ${text}`}>{expiryShort(date)}</span>
      {!compact && (
        <span className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className={`absolute inset-y-0 left-0 rounded-full ${bar} ${days < 0 ? 'opacity-60' : ''}`} style={{ width: `${pct}%` }} />
        </span>
      )}
      <span className={`text-xs whitespace-nowrap ${days < 0 ? 'font-semibold text-danger' : 'text-ink-3'}`}>{days < 0 ? 'Expired' : relativeDays(days)}</span>
    </div>
  );
}

/** Sellable stock vs. minimum level. */
export function StockLevel({ qty, min, unit }) {
  const tone = qty === 0 ? 'text-danger' : qty <= min ? 'text-warning' : 'text-ink';
  const pct = min > 0 ? Math.min(100, (qty / (min * 3)) * 100) : 100;
  const bar = qty === 0 ? 'bg-danger' : qty <= min ? 'bg-warning' : 'bg-primary';
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="relative hidden h-1.5 w-12 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
        <span className={`absolute inset-y-0 left-0 ${bar}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`num font-medium ${tone}`}>{qty}</span>
      {unit && <span className="text-xs text-ink-3">{unit}</span>}
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{children}</kbd>;
}
