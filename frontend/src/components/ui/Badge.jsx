const TONES = {
  neutral: 'bg-surface-3 text-ink-2',
  primary: 'bg-primary-soft text-primary-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  caution: 'bg-caution-soft text-caution',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function Badge({ tone = 'neutral', dot = false, className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const SALE_STATUS = {
  completed: ['success', 'Completed'],
  partially_returned: ['caution', 'Part returned'],
  returned: ['neutral', 'Returned'],
  cancelled: ['danger', 'Cancelled'],
};
export function SaleStatusBadge({ status }) {
  const [tone, label] = SALE_STATUS[status] ?? ['neutral', status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

const PAYMENT_STATUS = { paid: ['success', 'Paid'], partial: ['caution', 'Part paid'], unpaid: ['warning', 'Unpaid'] };
export function PaymentStatusBadge({ status, overdue }) {
  if (overdue && status !== 'paid') return <Badge tone="danger" dot>Overdue</Badge>;
  const [tone, label] = PAYMENT_STATUS[status] ?? ['neutral', status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

const STOCK = {
  in_stock: ['success', 'In stock'],
  low_stock: ['warning', 'Low'],
  out_of_stock: ['danger', 'Out'],
};
export function StockBadge({ status }) {
  const [tone, label] = STOCK[status] ?? ['neutral', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ScheduleBadge({ schedule }) {
  if (!schedule || schedule === 'OTC') return null;
  return <Badge tone={schedule === 'X' ? 'danger' : 'info'} className="code">Sch {schedule}</Badge>;
}
