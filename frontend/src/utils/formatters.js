/**
 * Format currency in Indian Rupees
 */
export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date to DD/MM/YYYY
 */
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
export function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const seconds = Math.floor((now - d) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(dateStr);
}

/**
 * Format large numbers with K/L/Cr suffixes (Indian system)
 */
export function formatNumber(num) {
  if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num?.toString() || '0';
}

/**
 * Calculate margin percentage
 */
export function getMarginPercent(costPrice, sellingPrice) {
  if (!costPrice || costPrice === 0) return 0;
  return (((sellingPrice - costPrice) / costPrice) * 100).toFixed(1);
}
