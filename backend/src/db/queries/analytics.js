const { supabaseAdmin } = require('../supabase');

/**
 * Dashboard KPIs — runs two queries in parallel for performance.
 */
async function getDashboardKPIs(userId) {
  const today = new Date().toISOString().split('T')[0];

  // Run medicine fetch and today's sales fetch in parallel
  const [medicinesRes, todaySalesRes] = await Promise.all([
    supabaseAdmin
      .from('medicines')
      .select('quantity, cost_price, selling_price, expiry_date, min_stock_level')
      .eq('user_id', userId)
      .eq('is_archived', false),
    supabaseAdmin
      .from('sales')
      .select('total_amount')
      .eq('user_id', userId)
      .gte('created_at', today),
  ]);

  const medicines = medicinesRes.data || [];
  const todaySales = todaySalesRes.data || [];

  const now = new Date();
  let totalMedicines = 0, totalStockValue = 0, expiringCount = 0, lowStockCount = 0;

  for (const m of medicines) {
    totalMedicines++;
    totalStockValue += m.quantity * parseFloat(m.cost_price);
    const diff = Math.ceil((new Date(m.expiry_date) - now) / 86400000);
    if (diff <= 30) expiringCount++;
    if (m.quantity <= m.min_stock_level) lowStockCount++;
  }

  const todayRevenue = todaySales.reduce((s, r) => s + parseFloat(r.total_amount), 0);

  return { totalMedicines, totalStockValue, expiringCount, todayRevenue, lowStockCount };
}

/**
 * Top sellers — filtered by userId via sales join to prevent cross-user data leaks.
 * Uses sales.created_at for date filtering (sale_items has no created_at column).
 */
async function getTopSellers(userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Join through sales to enforce user_id filtering
  const { data } = await supabaseAdmin
    .from('sales')
    .select('sale_items(medicine_id, quantity, medicines(name))')
    .eq('user_id', userId)
    .gte('created_at', since);

  // Aggregate by medicine name
  const map = {};
  (data || []).forEach(sale => {
    (sale.sale_items || []).forEach(item => {
      const name = item.medicines?.name || 'Unknown';
      map[name] = (map[name] || 0) + item.quantity;
    });
  });

  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, quantity: qty }));
}

/**
 * Sales trend — daily revenue aggregation over N days.
 */
async function getSalesTrend(userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabaseAdmin
    .from('sales')
    .select('total_amount, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at');

  const dailyMap = {};
  (data || []).forEach(sale => {
    const day = sale.created_at.split('T')[0];
    dailyMap[day] = (dailyMap[day] || 0) + parseFloat(sale.total_amount);
  });

  return Object.entries(dailyMap).map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));
}

/**
 * Category breakdown by stock value.
 */
async function getCategoryBreakdown(userId) {
  const { data } = await supabaseAdmin
    .from('medicines')
    .select('category, quantity, cost_price')
    .eq('user_id', userId)
    .eq('is_archived', false);

  const map = {};
  (data || []).forEach(m => {
    const cat = m.category || 'Other';
    map[cat] = (map[cat] || 0) + m.quantity * parseFloat(m.cost_price);
  });

  return Object.entries(map).map(([category, value]) => ({ category, value: Math.round(value) }));
}

/**
 * Payment method breakdown over N days.
 */
async function getPaymentMethods(userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabaseAdmin
    .from('sales')
    .select('payment_method, total_amount')
    .eq('user_id', userId)
    .gte('created_at', since);

  const map = {};
  (data || []).forEach(s => {
    map[s.payment_method] = (map[s.payment_method] || 0) + parseFloat(s.total_amount);
  });

  return Object.entries(map).map(([method, amount]) => ({ method, amount: Math.round(amount) }));
}

module.exports = { getDashboardKPIs, getTopSellers, getSalesTrend, getCategoryBreakdown, getPaymentMethods };
