const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN');

export const money = (v) => inr.format(Number(v) || 0);
export const moneyWhole = (v) => inrWhole.format(Number(v) || 0);
export const number = (v) => num.format(Number(v) || 0);

/** ₹1.2L / ₹3.4Cr style for compact KPI tiles. */
export function moneyCompact(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return moneyWhole(n);
}

export function date(value, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  const d = typeof value === 'string' && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', opts);
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Expiry as printed on packs: "08/2027". */
export function expiryShort(value) {
  if (!value) return '—';
  const [y, m] = value.split('-');
  return `${m}/${y}`;
}

export function daysUntil(value) {
  if (!value) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${value}T00:00:00`);
  return Math.round((d - today) / 86400000);
}

export function relativeDays(days) {
  if (days == null) return '—';
  if (days < 0) return `${-days}d ago`;
  if (days === 0) return 'today';
  if (days < 60) return `in ${days}d`;
  if (days < 730) return `in ${Math.round(days / 30)}mo`;
  return `in ${(days / 365).toFixed(1)}y`;
}

export function timeAgo(value) {
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const todayIso = () => new Date().toLocaleDateString('en-CA');
export const daysAgoIso = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA');

export function pctChange(current, previous) {
  const c = Number(current) || 0; const p = Number(previous) || 0;
  if (!p) return null;
  return ((c - p) / p) * 100;
}
