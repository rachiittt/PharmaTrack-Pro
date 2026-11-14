import { AlertTriangle, Loader2, Lock, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-ink-3 ${className}`} aria-label="Loading" />;
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-surface-3 ${className}`} aria-hidden />;
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-ink-3" role="status">
      <Spinner /> {label}
    </div>
  );
}

/** Explains why there is nothing here and what to do next. */
export function EmptyState({ icon: Icon, title, children, action, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'} px-6`}>
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          <Icon size={20} aria-hidden />
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load this', compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'} px-6`} role="alert">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle size={20} aria-hidden />
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-ink-3">{error?.message || 'Unexpected error.'}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Forbidden({ what = 'this page' }) {
  return (
    <EmptyState icon={Lock} title="You don't have access">
      Your role doesn't include {what}. Ask the pharmacy owner if you need it.
    </EmptyState>
  );
}

export function InlineAlert({ tone = 'warning', icon: Icon = AlertTriangle, title, children, action }) {
  const tones = {
    warning: 'border-warning/30 bg-warning-soft text-warning',
    danger: 'border-danger/30 bg-danger-soft text-danger',
    info: 'border-info/30 bg-info-soft text-info',
    success: 'border-success/30 bg-success-soft text-success',
  };
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 ${tones[tone]}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}
