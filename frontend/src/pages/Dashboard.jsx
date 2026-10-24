import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { analyticsAPI, alertAPI, medicineAPI } from '../services/api';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Package, AlertTriangle, DollarSign, ArrowRight, Clock, MessageCircle, TrendingUp, ShoppingCart, Users, Activity, Pill, CalendarDays, BarChart3, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/formatters';

const BRAND_COLORS = ['#60A5FA', '#818CF8', '#4ADE80', '#F472B6', '#FBBF24'];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

// ── Demo data: shown immediately, replaced by live Supabase data when connected ──
const generateDemoSalesTrend = () => Array.from({ length: 30 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - 29 + i);
  return { date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), revenue: Math.floor(8000 + Math.random() * 12000 + (i > 20 ? 3000 : 0)) };
});

const DEMO_TOP_SELLERS = [
  { name: 'Dolo 650', quantity: 342 }, { name: 'Azithromycin 500mg', quantity: 218 },
  { name: 'Pantoprazole 40mg', quantity: 195 }, { name: 'Metformin 500mg', quantity: 167 },
  { name: 'Cetirizine 10mg', quantity: 145 },
];
const DEMO_CATEGORIES = [
  { category: 'Tablet', value: 145000 }, { category: 'Capsule', value: 62000 },
  { category: 'Syrup', value: 38000 }, { category: 'Injection', value: 28000 },
  { category: 'Other', value: 27000 },
];
const DEMO_KPIS = { totalMedicines: 247, totalStockValue: 342500, expiringCount: 25, todayRevenue: 14680, yesterdayRevenue: 12340, weekChange: 12.5 };
const DEMO_ALERTS = { expired: 5, critical: 8, warning: 12, upcoming: 10, low_stock: 6 };
const DEMO_RECENT_SALES = [
  { id: 's1', invoice_no: 'SPMS-20261023-1001', total_amount: 1250, payment_method: 'upi', items_count: 3, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 's2', invoice_no: 'SPMS-20261023-1002', total_amount: 480, payment_method: 'cash', items_count: 2, created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 's3', invoice_no: 'SPMS-20261023-1003', total_amount: 2100, payment_method: 'card', items_count: 5, created_at: new Date(Date.now() - 14400000).toISOString() },
  { id: 's4', invoice_no: 'SPMS-20261022-0998', total_amount: 670, payment_method: 'upi', items_count: 1, created_at: new Date(Date.now() - 28800000).toISOString() },
];
const DEMO_LOW_STOCK = [
  { id: 'l1', name: 'Paracetamol 500mg', quantity: 5, min_stock_level: 50, category: 'Tablet' },
  { id: 'l2', name: 'Omeprazole 20mg', quantity: 3, min_stock_level: 20, category: 'Capsule' },
  { id: 'l3', name: 'Augmentin 625', quantity: 8, min_stock_level: 30, category: 'Tablet' },
];
const DEMO_EXPIRING = [
  { id: 'e1', name: 'Crocin 500mg', batch_no: 'CR5001', days_until_expiry: -5, expiry_status: 'expired' },
  { id: 'e2', name: 'Metformin 500mg', batch_no: 'MT2204', days_until_expiry: -12, expiry_status: 'expired' },
  { id: 'e3', name: 'Azithromycin 500mg', batch_no: 'AZ1105', days_until_expiry: 3, expiry_status: 'critical' },
];

// ── Helper Components ──
function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs font-semibold font-heading text-slate-400 mb-1.5 uppercase tracking-wide">{label}</p>
      {payload.map((p, i) => {
        const val = p?.value ?? 0;
        const displayVal = formatter ? formatter(val, p?.name)[0] : (typeof val === 'number' ? val.toLocaleString('en-IN') : val);
        return (
          <p key={i} className="text-sm font-bold font-sans text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p?.color || p?.payload?.fill || '#0EA5E9' }} />
            {displayVal}
          </p>
        );
      })}
    </div>
  );
}

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-700 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 z-50 relative">
      <span className="font-semibold">{payload[0]?.payload?.name || 'Item'}:</span>
      <span>{payload[0]?.value ?? 0} units</span>
    </div>
  );
}

function Counter({ from = 0, to = 0, duration = 0.8, prefix = '' }) {
  const target = typeof to === 'number' && !isNaN(to) ? to : 0;
  const [count, setCount] = useState(from);
  useEffect(() => {
    let startTime, af;
    const animate = (time) => {
      if (!startTime) startTime = time;
      const progress = (time - startTime) / (duration * 1000);
      if (progress < 1) { setCount(Math.floor(from + (target - from) * progress)); af = requestAnimationFrame(animate); }
      else setCount(target);
    };
    af = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(af);
  }, [from, target, duration]);
  return <>{prefix}{(count || 0).toLocaleString('en-IN')}</>;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const paymentBadge = { cash: 'bg-emerald-500/15 text-emerald-400', upi: 'bg-violet-500/15 text-violet-400', card: 'bg-sky-500/15 text-sky-400' };

// ── Main Dashboard ──
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [kpis, setKpis] = useState(DEMO_KPIS);
  const [alerts, setAlerts] = useState(DEMO_ALERTS);
  const [salesTrend, setSalesTrend] = useState(() => generateDemoSalesTrend());
  const [topSellers, setTopSellers] = useState(DEMO_TOP_SELLERS);
  const [categories, setCategories] = useState(DEMO_CATEGORIES);
  const [lowStockMeds, setLowStockMeds] = useState(DEMO_LOW_STOCK);
  const [expiringMeds, setExpiringMeds] = useState(DEMO_EXPIRING);
  const [recentSales, setRecentSales] = useState(DEMO_RECENT_SALES);
  const [isLive, setIsLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState('30D');

  const sparklineData = useMemo(() => salesTrend.slice(-7), [salesTrend]);

  // Try fetching live data — silently replace demo data if Supabase is connected
  const fetchLiveData = async (showToast = false) => {
    setRefreshing(true);
    try {
      const days = period === '7D' ? 7 : period === '90D' ? 90 : 30;
      const [kpiRes, alertRes, trendRes, topRes, catRes, medsRes] = await Promise.all([
        analyticsAPI.dashboard(), alertAPI.summary(), analyticsAPI.salesTrend(days),
        analyticsAPI.topSellers(days), analyticsAPI.categoryBreakdown(), medicineAPI.list({ limit: 100 }),
      ]);
      setKpis(kpiRes.data); setAlerts(alertRes.data); setSalesTrend(trendRes.data);
      setTopSellers(topRes.data); setCategories(catRes.data);
      const meds = medsRes.data?.data || [];
      setLowStockMeds(meds.filter(m => m.is_low_stock).slice(0, 5));
      setExpiringMeds(meds.filter(m => ['expired', 'critical', 'warning'].includes(m.expiry_status)).slice(0, 5));
      setIsLive(true);
      if (showToast) toast.success('Dashboard refreshed from database');
    } catch {
      // Backend unreachable — keep showing demo data (already loaded)
      setIsLive(false);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchLiveData(); }, [period]);

  const firstName = user?.full_name?.split(' ')[0] || 'Admin';

  const kpiCards = [
    { label: "Today's Revenue", value: kpis?.todayRevenue || 0, prefix: '₹', icon: DollarSign, gradient: 'from-[#0EA5E9] to-[#3B82F6]', sparkColor: '#0EA5E9', badge: `+${kpis?.weekChange || 12}%`, up: true },
    { label: 'Total Medicines', value: kpis?.totalMedicines || 0, prefix: '', icon: Pill, gradient: 'from-[#6366F1] to-[#8B5CF6]', sparkColor: '#6366F1', badge: `${kpis?.totalMedicines || 247}`, up: true },
    { label: 'Expiring Soon', value: kpis?.expiringCount || 0, prefix: '', icon: Clock, gradient: 'from-[#EF4444] to-[#F97316]', sparkColor: '#EF4444', badge: `${alerts?.expired || 0} expired`, up: false },
    { label: 'Low Stock Alerts', value: alerts?.low_stock || 0, prefix: '', icon: AlertTriangle, gradient: 'from-[#F59E0B] to-[#EAB308]', sparkColor: '#F59E0B', badge: 'action needed', up: false },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6 pb-10">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A] dark:text-[#F1F5F9] font-heading tracking-tight">
            {getGreeting()}, {firstName} 👋
          </h1>
          <p className="text-sm text-surface-500 mt-1 font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {!isLive && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold">Preview Data</span>}
            {isLive && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">● Live</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLiveData(true)} disabled={refreshing} className="gap-2 self-start">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </Button>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((card, i) => (
          <div key={i} className="card p-5 relative overflow-hidden flex flex-col justify-between hover:scale-[1.02] hover:shadow-lg transition-all duration-300 group">
            <div className={`absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b ${card.gradient}`} />
            <div className="flex items-start justify-between mb-3 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center text-white shadow-sm`}>
                  <card.icon size={18} />
                </div>
                <p className="text-[13px] font-semibold text-surface-500 dark:text-surface-400">{card.label}</p>
              </div>
            </div>
            <p className="text-[32px] font-bold font-sans text-[#0F172A] dark:text-white leading-none tracking-tight relative z-10 mb-1">
              <Counter to={card.value} prefix={card.prefix} />
            </p>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-start mt-1 ${card.up ? 'bg-emerald-500/10 text-emerald-500' : 'bg-orange-500/10 text-orange-500'}`}>
              {card.badge}
            </span>
            {/* Mini sparkline */}
            <div className="mt-3 h-8 w-full opacity-70 relative z-10 -mb-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line type="monotone" dataKey="revenue" stroke={card.sparkColor} strokeWidth={1.5} dot={false} isAnimationActive={true} animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Quick Actions Strip */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'New Sale', icon: ShoppingCart, color: '#0EA5E9', path: '/billing' },
          { label: 'Add Medicine', icon: Pill, color: '#6366F1', path: '/inventory' },
          { label: 'View Alerts', icon: AlertTriangle, color: '#F97316', path: '/expiry-alerts' },
          { label: 'Customers', icon: Users, color: '#22C55E', path: '/customers' },
        ].map((action) => (
          <button key={action.label} onClick={() => navigate(action.path)}
            className="card p-4 flex items-center gap-3 hover:shadow-md hover:border-[#0EA5E9]/30 transition-all group text-left">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
              style={{ backgroundColor: `${action.color}15`, color: action.color }}>
              <action.icon size={20} />
            </div>
            <span className="text-sm font-bold text-[#0F172A] dark:text-white">{action.label}</span>
          </button>
        ))}
      </motion.div>

      {/* Attention Required Banner */}
      {(expiringMeds.length > 0 || lowStockMeds.length > 0) && (
        <motion.div variants={fadeUp} className="rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-l-4 border-l-[#EF4444] bg-red-50 dark:bg-red-950/20 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#EF4444]/10 text-[#EF4444] flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="text-[17px] font-bold font-heading text-[#0F172A] dark:text-white">Attention Required</h4>
              <p className="text-[14px] font-medium text-surface-600 dark:text-surface-300 mt-0.5">
                {expiringMeds.length} expiring medicines and {lowStockMeds.length} low stock items need your attention.
              </p>
            </div>
          </div>
          <Button onClick={() => navigate('/expiry-alerts')} variant="danger" className="shrink-0 font-bold">
            Review Items <ArrowRight size={16} className="ml-2" />
          </Button>
        </motion.div>
      )}

      {/* Revenue Trend + Categories */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend */}
        <div className="card flex flex-col lg:col-span-2">
          <div className="p-5 border-b border-[#E2E8F0] dark:border-surface-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-[17px] font-bold font-heading text-[#0F172A] dark:text-white flex items-center gap-2">
                <Activity size={18} className="text-[#0EA5E9]" /> Revenue Trend
              </h3>
              <p className="text-[12px] font-medium text-surface-500 mt-0.5">Daily income over time</p>
            </div>
            <div className="flex items-center gap-1 bg-surface-100 dark:bg-surface-800 p-1 rounded-lg">
              {['7D', '30D', '90D'].map(p => (
                <button key={p} onClick={() => setPeriod(p)} className={`px-3.5 py-1.5 text-[12px] font-bold rounded-md transition-colors ${period === p ? 'bg-white dark:bg-surface-700 text-[#0F172A] dark:text-white shadow-sm' : 'text-surface-500 hover:text-[#0F172A] dark:hover:text-white'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="p-5 flex-1 min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="colorBrandDash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'Inter' }} tickLine={false} axisLine={false} dy={8} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'Inter' }} tickLine={false} axisLine={false} dx={-8} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip formatter={(v) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />} cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area type="monotone" dataKey="revenue" stroke="#38BDF8" strokeWidth={2.5} fill="url(#colorBrandDash)" activeDot={{ stroke: '#FFF', strokeWidth: 3, r: 5, fill: '#38BDF8' }} animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Categories Donut */}
        <div className="card flex flex-col">
          <div className="p-5 border-b border-[#E2E8F0] dark:border-surface-700">
            <h3 className="text-[16px] font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2">
              <BarChart3 size={16} className="text-[#6366F1]" /> Categories
            </h3>
          </div>
          <div className="p-5 flex-1 min-h-[280px] flex flex-col justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categories} dataKey="value" nameKey="category" cx="50%" cy="45%" innerRadius={50} outerRadius={80} stroke="#0F172A" strokeWidth={2} animationDuration={800}>
                  {categories.map((_, i) => <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} fillOpacity={0.85} />)}
                </Pie>
                <Tooltip content={<CustomTooltip formatter={(v) => [`₹${v.toLocaleString('en-IN')}`, 'Value']} />} />
                <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: '#64748B', fontFamily: 'Inter', fontWeight: 500, paddingTop: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Top Sellers + Recent Sales */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Sellers */}
        <div className="card flex flex-col">
          <div className="p-5 border-b border-[#E2E8F0] dark:border-surface-700">
            <h3 className="text-[16px] font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2">
              <TrendingUp size={16} className="text-[#22C55E]" /> Top Sellers
            </h3>
          </div>
          <div className="p-5 flex-1 min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSellers} layout="vertical" barSize={20}>
                <defs>
                  <linearGradient id="colorBarGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#38BDF8" />
                    <stop offset="100%" stopColor="#6366F1" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" strokeOpacity={0.4} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12, fill: '#94A3B8', fontWeight: 600 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<BarTooltip />} />
                <Bar dataKey="quantity" fill="url(#colorBarGrad)" radius={[0, 6, 6, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Sales */}
        <div className="card flex flex-col">
          <div className="p-5 border-b border-[#E2E8F0] dark:border-surface-700 flex items-center justify-between">
            <h3 className="text-[16px] font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2">
              <CalendarDays size={16} className="text-[#0EA5E9]" /> Recent Sales
            </h3>
            <button onClick={() => navigate('/sales-history')} className="text-xs font-bold text-[#0EA5E9] hover:underline">View All →</button>
          </div>
          <div className="flex-1 divide-y divide-[#E2E8F0] dark:divide-surface-700">
            {recentSales.map(sale => (
              <div key={sale.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#0EA5E9]/10 text-[#0EA5E9] flex items-center justify-center">
                    <ShoppingCart size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0F172A] dark:text-white font-mono">{sale.invoice_no.split('-').pop()}</p>
                    <p className="text-[11px] text-surface-400">{timeAgo(sale.created_at)} · {sale.items_count} items</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#0F172A] dark:text-white">{formatCurrency(sale.total_amount)}</p>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${paymentBadge[sale.payment_method] || ''}`}>{sale.payment_method}</span>
                </div>
              </div>
            ))}
            {recentSales.length === 0 && (
              <div className="p-8 text-center text-surface-400">
                <ShoppingCart size={28} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold">No sales yet</p>
                <p className="text-xs mt-1">Start billing to see recent sales here</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Bottom Widgets: Low Stock + Expiring + Quick Stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Low Stock */}
        <div className="card p-5 border-l-4 border-l-[#F97316]">
          <div className="flex items-center gap-2.5 mb-4">
            <Package size={18} className="text-[#F97316]" />
            <h4 className="text-[14px] font-bold text-[#0F172A] dark:text-white">Low Stock</h4>
          </div>
          <div className="space-y-3">
            {lowStockMeds.slice(0, 3).map(med => (
              <div key={med.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#0F172A] dark:text-white">{med.name}</p>
                  <p className="text-[11px] text-surface-400">{med.category}</p>
                </div>
                <span className="text-sm font-bold text-[#F97316]">{med.quantity} left</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/inventory')} className="text-[#F97316] font-semibold text-[12px] hover:underline mt-4 block">
            View All Low Stock →
          </button>
        </div>

        {/* Expiring */}
        <div className="card p-5 border-l-4 border-l-[#EF4444]">
          <div className="flex items-center gap-2.5 mb-4">
            <Clock size={18} className="text-[#EF4444]" />
            <h4 className="text-[14px] font-bold text-[#0F172A] dark:text-white">Expiring Soon</h4>
          </div>
          <div className="space-y-3">
            {expiringMeds.slice(0, 3).map(med => (
              <div key={med.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#0F172A] dark:text-white">{med.name}</p>
                  <p className="text-[11px] font-mono text-surface-400">{med.batch_no}</p>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${med.expiry_status === 'expired' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                  {med.days_until_expiry < 0 ? `${Math.abs(med.days_until_expiry)}d overdue` : `${med.days_until_expiry}d left`}
                </span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/expiry-alerts')} className="text-[#EF4444] font-semibold text-[12px] hover:underline mt-4 block">
            View Expiry Alerts →
          </button>
        </div>

        {/* Today's Summary */}
        <div className="card p-5 border-l-4 border-l-[#22C55E]">
          <div className="flex items-center gap-2.5 mb-4">
            <TrendingUp size={18} className="text-[#22C55E]" />
            <h4 className="text-[14px] font-bold text-[#0F172A] dark:text-white">Today's Summary</h4>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-500">Revenue</span>
              <span className="text-lg font-bold text-[#0F172A] dark:text-white">₹<Counter to={kpis?.todayRevenue || 0} /></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-500">Sales</span>
              <span className="text-lg font-bold text-[#0F172A] dark:text-white">{recentSales.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-500">Avg. Bill</span>
              <span className="text-lg font-bold text-[#0F172A] dark:text-white">
                {formatCurrency(recentSales.length > 0 ? recentSales.reduce((s, r) => s + r.total_amount, 0) / recentSales.length : 0)}
              </span>
            </div>
            <div className="h-px bg-[#E2E8F0] dark:bg-surface-700" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-500">Stock Value</span>
              <span className="text-base font-bold text-[#22C55E]">₹<Counter to={kpis?.totalStockValue || 0} /></span>
            </div>
          </div>
          <button onClick={() => navigate('/analytics')} className="text-[#22C55E] font-semibold text-[12px] hover:underline mt-4 block">
            Full Analytics →
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
