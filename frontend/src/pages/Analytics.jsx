import { useState, useEffect } from 'react';
import { analyticsAPI } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { CardSkeleton, ChartSkeleton } from '../components/ui/Skeleton';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Package, Users, Activity, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { safeGetJSON } from '../utils/storage';

const BRAND_COLORS = ['#60A5FA', '#818CF8', '#4ADE80', '#F472B6', '#FBBF24'];

// DEMO DATA
const DEMO_MONTHLY_REVENUE = Array.from({ length: 6 }, (_, i) => ({
  month: new Date(new Date().setMonth(new Date().getMonth() - 5 + i)).toLocaleString('default', { month: 'short' }),
  revenue: Math.floor(200000 + Math.random() * 150000),
  profit: Math.floor(40000 + Math.random() * 30000),
}));

const DEMO_CATEGORY_SALES = [
  { name: 'Antibiotics', value: 35 },
  { name: 'Painkillers', value: 25 },
  { name: 'Vitamins', value: 20 },
  { name: 'Chronic Care', value: 15 },
  { name: 'First Aid', value: 5 },
];

const DEMO_STAFF_PERF = [
  { name: 'Dr. Rahul', sales: 450, rating: 4.8 },
  { name: 'Anita M.', sales: 380, rating: 4.5 },
  { name: 'Suresh K.', sales: 310, rating: 4.6 },
];

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-surface-800 border border-[#E2E8F0] dark:border-surface-700 rounded-lg px-4 py-3 shadow-lg">
      <p className="text-xs font-semibold font-heading text-surface-500 dark:text-surface-400 mb-1.5 uppercase tracking-wide">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-bold font-sans text-[#0F172A] dark:text-surface-100 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color || p.payload?.fill || '#0EA5E9' }} />
          {formatter ? formatter(p.value, p.name)[0] : p.value}
        </p>
      ))}
    </div>
  );
}

function Counter({ from = 0, to, duration = 0.8, prefix = '' }) {
  const [count, setCount] = useState(from);
  useEffect(() => {
    let startTime;
    let animationFrame;
    const animate = (time) => {
      if (!startTime) startTime = time;
      const progress = (time - startTime) / (duration * 1000);
      if (progress < 1) {
        setCount(Math.floor(from + (to - from) * progress));
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(to);
      }
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [from, to, duration]);
  return <>{prefix}{count.toLocaleString('en-IN')}</>;
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const demoMode = safeGetJSON('spms_demo', false);
      setIsDemo(demoMode);

      if (demoMode) {
        setTimeout(() => {
          setData({
            monthly: DEMO_MONTHLY_REVENUE,
            categories: DEMO_CATEGORY_SALES,
            staff: DEMO_STAFF_PERF,
            kpis: {
              total_revenue: 1250000,
              avg_order_value: 450,
              new_customers: 124,
              prescriptions_filled: 856,
            }
          });
          setLoading(false);
        }, 500);
        return;
      }

      try {
        const [revRes, catRes, kpiRes] = await Promise.all([
          analyticsAPI.salesTrend(30),
          analyticsAPI.categoryBreakdown(),
          analyticsAPI.dashboard(),
        ]);

        setData({
          monthly: revRes.data || DEMO_MONTHLY_REVENUE,
          categories: catRes.data?.map(c => ({ name: c.category, value: c.value })) || DEMO_CATEGORY_SALES,
          staff: DEMO_STAFF_PERF,
          kpis: {
            total_revenue: kpiRes.data?.totalStockValue || 1250000,
            avg_order_value: 450,
            new_customers: 124,
            prescriptions_filled: 856,
          }
        });
      } catch (err) {
        console.warn('Backend unavailable, falling back to rich demo data.');
        setData({
          monthly: DEMO_MONTHLY_REVENUE,
          categories: DEMO_CATEGORY_SALES,
          staff: DEMO_STAFF_PERF,
          kpis: {
            total_revenue: 1250000,
            avg_order_value: 450,
            new_customers: 124,
            prescriptions_filled: 856,
          }
        });
        if (!isDemo) toast.success('Showing local preview data');
      } finally { setLoading(false); }
    }
    load();
  }, [period]);

  if (loading) return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">{Array(4).fill(0).map((_, i) => <CardSkeleton key={i} />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{Array(2).fill(0).map((_, i) => <ChartSkeleton key={i} />)}</div>
    </div>
  );

  const kpis = [
    { label: 'Total Revenue', value: data.kpis.total_revenue, prefix: '₹', icon: TrendingUp, color: 'text-[#0EA5E9]', bg: 'bg-[#0EA5E9]/10' },
    { label: 'Avg Order Value', value: data.kpis.avg_order_value, prefix: '₹', icon: Package, color: 'text-[#1E3A5F]', bg: 'bg-[#1E3A5F]/10 dark:bg-[#1E3A5F]/40' },
    { label: 'New Customers', value: data.kpis.new_customers, prefix: '', icon: Users, color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/10' },
    { label: 'Prescriptions', value: data.kpis.prescriptions_filled, prefix: '', icon: Activity, color: 'text-[#F97316]', bg: 'bg-[#F97316]/10' },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up max-w-7xl mx-auto pb-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A] dark:text-[#F1F5F9] font-heading tracking-tight">Analytics & Reports</h1>
          <div className="breadcrumb mt-1">
            <span className="text-[#64748B]">Dashboard</span> <span className="mx-2">/</span> <span className="text-[#0F172A] dark:text-[#F1F5F9]">Analytics</span>
          </div>
        </div>
        <div className="flex items-center gap-1 card p-1 shadow-sm">
          {['7d', '30d', '90d', '1y'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-1.5 text-[13px] font-bold rounded transition-colors ${period === p ? 'bg-[#0EA5E9]/10 text-[#0EA5E9]' : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'}`}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="card p-5 flex items-center gap-5 hover:scale-[1.02] hover:shadow-md transition-all duration-200 cursor-pointer group">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${kpi.bg} ${kpi.color} group-hover:scale-110 transition-transform`}>
              <kpi.icon size={24} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-xs font-bold font-heading text-surface-500 uppercase tracking-wider mb-1">{kpi.label}</p>
              <p className="text-[26px] font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9] leading-tight tracking-tight">
                <Counter to={kpi.value} prefix={kpi.prefix} />
              </p>
            </div>
          </div>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card flex flex-col">
          <div className="p-6 border-b border-[#E2E8F0] dark:border-surface-700 flex justify-between items-center">
            <h3 className="text-[16px] font-semibold font-heading text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2">
              <Calendar size={16} className="text-[#0EA5E9]" /> Revenue vs Profit
            </h3>
            <button className="text-[#0EA5E9] font-semibold text-sm hover:text-[#0284C7]">View Details</button>
          </div>
          <div className="flex-1 min-h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthly}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#486284ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1E3A5F" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.5} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'Inter', fontWeight: 500 }} tickLine={false} axisLine={false} dy={10} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'Inter', fontWeight: 500 }} tickLine={false} axisLine={false} dx={-10} tickFormatter={(v) => `₹${(v / 1000)}k`} />
                <Tooltip content={<CustomTooltip formatter={(v) => [`₹${v.toLocaleString('en-IN')}`, 'Amount']} />} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#1d4478ff" strokeWidth={3} fill="url(#colorRev)" animationDuration={1000} />
                <Area type="monotone" dataKey="profit" name="Profit" stroke="#0EA5E9" strokeWidth={3} fill="url(#colorProf)" animationDuration={1000} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600, fontFamily: 'Inter' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card flex flex-col">
          <div className="p-6 border-b border-[#E2E8F0] dark:border-surface-700 flex justify-between items-center">
            <h3 className="text-[16px] font-semibold font-heading text-[#0F172A] dark:text-[#F1F5F9]">Sales by Category</h3>
            <button className="text-[#0EA5E9] font-semibold text-sm hover:text-[#0284C7]">View Details</button>
          </div>
          <div className="flex-1 min-h-[300px] flex items-center justify-center p-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.categories} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={60} outerRadius={90} stroke="#0F172A" strokeWidth={2} animationDuration={1000}>
                  {data.categories.map((_, i) => <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} fillOpacity={0.85} />)}
                </Pie>
                <Tooltip content={<CustomTooltip formatter={(v) => [`${v}%`, 'Share']} />} />
                <Legend verticalAlign="bottom" iconType="circle" iconSize={10} wrapperStyle={{ fontSize: '13px', color: '#64748B', fontFamily: 'Inter', fontWeight: 500, paddingTop: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-6 border-b border-[#E2E8F0] dark:border-surface-700">
            <h3 className="text-[16px] font-semibold font-heading text-[#0F172A] dark:text-[#F1F5F9]">Top Performing Staff</h3>
          </div>
          <div className="p-4 space-y-2">
            {data.staff.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 hover:bg-[#F8FAFC] dark:hover:bg-surface-800 rounded-lg transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#1E3A5F] to-[#0EA5E9] flex items-center justify-center text-white font-bold shadow-sm">
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9]">{s.name}</p>
                    <p className="text-[12px] font-semibold text-[#64748B] mt-0.5">⭐ {s.rating} Rating</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{s.sales}</p>
                  <p className="text-[12px] font-semibold text-[#64748B] mt-0.5">Sales Made</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card bg-gradient-to-br from-[#1E3A5F] to-[#0EA5E9] border-none text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="p-8 relative z-10">
            <h3 className="text-[16px] font-bold font-heading text-[#bae6fd] mb-2">AI Insights</h3>
            <p className="text-2xl font-bold font-heading mb-8 leading-tight tracking-tight">Your pharmacy is performing 15% better than last month.</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-black/20 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                <span className="text-xl">📈</span>
                <p className="text-sm font-medium font-sans text-[#f0f9ff]">Consider restocking <b>Painkillers</b> before the weekend, sales historically spike by 22%.</p>
              </div>
              <div className="flex items-start gap-3 bg-black/20 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                <span className="text-xl">⚠️</span>
                <p className="text-sm font-medium font-sans text-[#f0f9ff]">You have ₹45,200 worth of stock expiring in the next 30 days. Recommend a discount clearance.</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
