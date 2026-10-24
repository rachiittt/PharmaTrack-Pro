export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
    success: 'bg-emerald-50 text-[#22C55E] dark:bg-emerald-900/20 dark:text-emerald-400',
    warning: 'bg-amber-50 text-[#EAB308] dark:bg-amber-900/20 dark:text-amber-400',
    danger: 'bg-red-50 text-[#EF4444] dark:bg-red-900/20 dark:text-red-400',
    info: 'bg-sky-50 text-[#0EA5E9] dark:bg-sky-900/20 dark:text-sky-400',
    orange: 'bg-orange-50 text-[#F97316] dark:bg-orange-900/20 dark:text-orange-400',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold font-heading tracking-wide uppercase ${variants[variant] || variants.default} ${className}`}>
      {children}
    </span>
  );
}

export function ExpiryBadge({ status }) {
  const config = {
    expired: { label: 'Expired', variant: 'danger' },
    critical: { label: 'Critical', variant: 'orange' },
    warning: { label: 'Warning', variant: 'warning' },
    upcoming: { label: 'Upcoming', variant: 'info' },
    healthy: { label: 'Healthy', variant: 'success' },
  };
  const c = config[status] || config.healthy;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

export function LowStockBadge() {
  return <Badge variant="orange">Low Stock</Badge>;
}
