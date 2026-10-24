import { useState, useEffect } from 'react';
import { salesAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Badge } from '../components/ui/Badge';
import { TableSkeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { FileText, Eye, Download, Search, Calendar, ChevronRight, Edit2 } from 'lucide-react';
import { safeGetJSON } from '../utils/storage';

// DEMO DATA
const DEMO_SALES = Array.from({ length: 25 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(i / 3)); // Spread across last 8 days
  const subtotal = Math.floor(150 + Math.random() * 2500);
  const tax = Math.floor(subtotal * 0.12);
  const methods = ['upi', 'upi', 'cash', 'card'];
  return {
    id: `sale-${i}`,
    invoice_no: `INV-2026-${1045 - i}`,
    created_at: d.toISOString(),
    total_amount: subtotal + tax,
    payment_method: methods[i % 4],
    customers: i % 3 === 0 ? { name: ['Amit Patel', 'Sunita Sharma', 'Rahul Desai'][i % 3] } : null,
    sale_items: Array(Math.floor(1 + Math.random() * 4)).fill(null)
  };
});

export default function SalesHistory() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [payment, setPayment] = useState('');
  const [isDemo, setIsDemo] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const demoMode = safeGetJSON('spms_demo', false);
    setIsDemo(demoMode);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);

      if (isDemo) {
        setTimeout(() => {
          let filtered = [...DEMO_SALES];
          if (payment) filtered = filtered.filter(s => s.payment_method === payment);
          if (search) filtered = filtered.filter(s => s.invoice_no.toLowerCase().includes(search.toLowerCase()) || s.customers?.name?.toLowerCase().includes(search.toLowerCase()));
          
          setTotal(filtered.length);
          setSales(filtered.slice((page - 1) * 20, page * 20));
          setLoading(false);
        }, 500);
        return;
      }

      try {
        const res = await salesAPI.list({ page, limit: 20, payment_method: payment || undefined, search: search || undefined });
        setSales(res.data?.data || []);
        setTotal(res.data?.total || 0);
      } catch {} finally { setLoading(false); }
    })();
  }, [page, payment, search, isDemo]);

  const totalRevenue = sales.reduce((s, r) => s + parseFloat(r.total_amount), 0);
  const avgOrder = sales.length ? totalRevenue / sales.length : 0;

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Sales History</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">View, search, and export past transactions</p>
        </div>
        <Button variant="outline" className="bg-white dark:bg-slate-800 shadow-sm border-slate-200 dark:border-slate-700">
          <Download size={16} className="mr-2" /> Export CSV
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -z-0 group-hover:scale-150 transition-transform duration-500" />
          <p className="text-xs font-bold text-blue-200 uppercase tracking-wider relative z-10">Period Revenue</p>
          <p className="text-3xl font-extrabold mt-1 relative z-10">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Transactions</p>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{total}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Order Value</p>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{formatCurrency(avgOrder)}</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl p-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search invoice number or customer name..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white dark:focus:bg-slate-800 text-slate-900 dark:text-white transition-all shadow-inner" />
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200 dark:border-slate-700/50 overflow-x-auto">
          {['', 'cash', 'upi', 'card'].map(m => (
            <button key={m} onClick={() => { setPayment(m); setPage(1); }}
              className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                payment === m 
                ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>
              {m ? m : 'All Payments'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {loading ? <TableSkeleton rows={8} cols={7} /> : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden relative">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 backdrop-blur-sm">
                  {['Invoice Details', 'Customer', 'Items', 'Amount', 'Payment Mode', 'Action'].map(h => (
                    <th key={h} className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {sales.map((s, idx) => (
                  <tr key={s.id} className="group hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center text-slate-500 border border-slate-200 dark:border-slate-600 group-hover:bg-primary-50 group-hover:text-primary-600 group-hover:border-primary-100 transition-colors">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="font-bold font-mono text-slate-900 dark:text-white tracking-wide">{s.invoice_no}</p>
                          <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5"><Calendar size={12}/> {formatDate(s.created_at)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className={`font-bold ${s.customers?.name ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 italic'}`}>
                        {s.customers?.name || 'Walk-in Customer'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-600">
                        {s.sale_items?.length || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-extrabold text-lg text-slate-900 dark:text-white">{formatCurrency(s.total_amount)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={s.payment_method === 'cash' ? 'success' : s.payment_method === 'upi' ? 'info' : 'default'} className="uppercase px-3 py-1 shadow-sm">
                        {s.payment_method || 'Unknown'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#0EA5E9] hover:bg-[#0EA5E9]/10 transition-colors">
                          <Eye size={14} /> View
                        </button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#F59E0B] hover:bg-[#F59E0B]/10 transition-colors">
                          <Edit2 size={14} /> Edit / Return
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-20 text-center">
                      <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200 dark:border-slate-700">
                        <Search size={32} className="text-slate-400" />
                      </div>
                      <p className="text-lg font-bold text-slate-800 dark:text-white mb-1">No sales found</p>
                      <p className="text-sm text-slate-500 max-w-sm mx-auto">We couldn't find any transactions matching your filters.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 20 && !isDemo && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-sm font-medium text-slate-500">Showing <span className="text-slate-900 dark:text-white font-bold">{sales.length}</span> of <span className="text-slate-900 dark:text-white font-bold">{total}</span> records</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="bg-white dark:bg-slate-800">Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)} className="bg-white dark:bg-slate-800">Next</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
