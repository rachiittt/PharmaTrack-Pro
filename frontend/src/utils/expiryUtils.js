/**
 * Expiry status utilities — 5-tier system
 */
export function getExpiryStatus(expiryDate) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= 10) return 'critical';
  if (diffDays <= 30) return 'warning';
  if (diffDays <= 60) return 'upcoming';
  return 'healthy';
}

export function getDaysUntilExpiry(expiryDate) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export const EXPIRY_CONFIG = {
  expired:  { label: 'Expired',  color: 'red',    bgClass: 'bg-red-50 dark:bg-red-950',       borderClass: 'border-l-4 border-red-600',    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  critical: { label: 'Critical', color: 'orange', bgClass: 'bg-orange-50 dark:bg-orange-950',  borderClass: 'border-l-4 border-orange-500', badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  warning:  { label: 'Warning',  color: 'amber',  bgClass: 'bg-amber-50 dark:bg-amber-950',    borderClass: 'border-l-4 border-amber-400',  badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  upcoming: { label: 'Upcoming', color: 'blue',   bgClass: 'bg-blue-50 dark:bg-blue-950',      borderClass: 'border-l-4 border-blue-300',   badgeClass: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' },
  healthy:  { label: 'Healthy',  color: 'green',  bgClass: '',                                  borderClass: '',                              badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
};

export function getExpiryLabel(days) {
  if (days < 0) return `Expired ${Math.abs(days)} days ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `${days} days left`;
}
