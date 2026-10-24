import { useState, useEffect } from 'react';
import { customerAPI } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { Button } from '../components/ui/Button';
import { SlideOver } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { TableSkeleton } from '../components/ui/Skeleton';
import { Plus, Edit2, Users, Star, Phone, Search, Mail, Calendar, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { safeGetJSON } from '../utils/storage';

// DEMO DATA
const DEMO_CUSTOMERS = [
  { id: 'c1', name: 'Amit Patel', phone: '9876543210', email: 'amit@gmail.com', date_of_birth: '1985-03-15', total_spent: 14250, loyalty_points: 285, visit_count: 12 },
  { id: 'c2', name: 'Sunita Sharma', phone: '8765432109', email: 'sunita.s@yahoo.com', date_of_birth: '1992-07-22', total_spent: 8760, loyalty_points: 175, visit_count: 8 },
  { id: 'c3', name: 'Rahul Desai', phone: '7654321098', email: '', date_of_birth: '', total_spent: 32400, loyalty_points: 648, visit_count: 28 },
  { id: 'c4', name: 'Meera Krishnamurthy', phone: '6543210987', email: 'meera.k@outlook.com', date_of_birth: '1978-11-08', total_spent: 5200, loyalty_points: 104, visit_count: 5 },
  { id: 'c5', name: 'Rajendra Singh', phone: '9012345678', email: '', date_of_birth: '1968-01-25', total_spent: 45800, loyalty_points: 916, visit_count: 42 },
  { id: 'c6', name: 'Fatima Khan', phone: '8901234567', email: 'fatima@gmail.com', date_of_birth: '1995-09-12', total_spent: 3100, loyalty_points: 62, visit_count: 3 },
];

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', date_of_birth: '' });
  const [saving, setSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const load = async () => {
    const demoMode = safeGetJSON('spms_demo', false);
    setIsDemo(demoMode);

    if (demoMode) {
      setTimeout(() => {
        let filtered = DEMO_CUSTOMERS;
        if (search) filtered = filtered.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));
        setCustomers(filtered);
        setLoading(false);
      }, 400);
      return;
    }

    try { const res = await customerAPI.list({ search: search || undefined }); setCustomers(res.data?.data || []); }
    catch {} finally { setLoading(false); }
  };

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    if (isDemo) {
      setTimeout(() => { toast.success(editing ? 'Customer updated (Demo)' : 'Customer added (Demo)'); setShowForm(false); setEditing(null); setSaving(false); }, 600);
      return;
    }
    try {
      if (editing) { await customerAPI.update(editing.id, form); toast.success('Updated'); }
      else { await customerAPI.create(form); toast.success('Customer added'); }
      setShowForm(false); setEditing(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  // Aggregate stats
  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((s, c) => s + (c.total_spent || 0), 0);
  const avgSpend = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25">
              <Users size={20} />
            </div>
            Customers
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Manage your customer base and loyalty program</p>
        </div>
        <Button onClick={() => { setForm({ name: '', phone: '', email: '', date_of_birth: '' }); setEditing(null); setShowForm(true); }} className="shadow-lg shadow-primary-500/20">
          <Plus size={18} className="mr-1" /> Add Customer
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 dark:bg-emerald-900/10 rounded-bl-full group-hover:scale-150 transition-transform duration-500" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Customers</p>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{totalCustomers}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 dark:bg-blue-900/10 rounded-bl-full group-hover:scale-150 transition-transform duration-500" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Revenue</p>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-50 dark:bg-amber-900/10 rounded-bl-full group-hover:scale-150 transition-transform duration-500" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Spend</p>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{formatCurrency(avgSpend)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl p-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone number, or email..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white dark:focus:bg-slate-800 text-slate-900 dark:text-white transition-all shadow-inner" />
        </div>
      </div>

      {/* Table */}
      {loading ? <TableSkeleton rows={6} cols={5} /> : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 backdrop-blur-sm">
                  {['Customer', 'Contact', 'Total Purchases', 'Loyalty Program', 'Actions'].map(h => (
                    <th key={h} className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {customers.map(c => (
                  <tr key={c.id} className="group hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold shadow-sm group-hover:scale-110 transition-transform">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{c.name}</p>
                          {c.visit_count && <p className="text-xs text-slate-500">{c.visit_count} visits</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {c.phone && <p className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400"><Phone size={12} className="text-slate-400" /> {c.phone}</p>}
                        {c.email && <p className="flex items-center gap-1.5 text-xs text-slate-500 truncate max-w-[180px]"><Mail size={12} className="text-slate-400" /> {c.email}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-extrabold text-lg text-slate-900 dark:text-white">{formatCurrency(c.total_spent || 0)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                          (c.loyalty_points || 0) >= 500 ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400' :
                          (c.loyalty_points || 0) >= 100 ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400' :
                          'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400'
                        }`}>
                          <Star size={12} className={`${(c.loyalty_points || 0) >= 500 ? 'fill-amber-400 text-amber-400' : (c.loyalty_points || 0) >= 100 ? 'fill-blue-400 text-blue-400' : 'text-slate-400'}`} />
                          {c.loyalty_points || 0} pts
                        </div>
                        {(c.loyalty_points || 0) >= 500 && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Gold</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => { setForm({ name: c.name, phone: c.phone || '', email: c.email || '', date_of_birth: c.date_of_birth || '' }); setEditing(c); setShowForm(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-700 transition-colors">
                        <Edit2 size={14} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-20 text-center">
                      <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200 dark:border-slate-700">
                        <Users size={32} className="text-slate-400" />
                      </div>
                      <p className="text-lg font-bold text-slate-800 dark:text-white mb-1">No customers yet</p>
                      <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">Customers are automatically added when you create a bill with their details.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Form */}
      <SlideOver isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Customer' : 'Add Customer'}>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 space-y-4">
            {[
              { l: 'Full Name *', f: 'name', r: true, placeholder: 'e.g. Amit Patel' },
              { l: 'Phone Number', f: 'phone', t: 'tel', placeholder: '9876543210' },
              { l: 'Email', f: 'email', t: 'email', placeholder: 'customer@email.com' },
              { l: 'Date of Birth', f: 'date_of_birth', t: 'date' },
            ].map(({ l, f, r, t, placeholder }) => (
              <div key={f}>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">{l}</label>
                <input type={t || 'text'} value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} required={r} placeholder={placeholder}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none text-slate-900 dark:text-white shadow-sm" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={saving} className="flex-1 shadow-lg shadow-primary-500/20">{editing ? 'Update' : 'Save Customer'}</Button>
            <Button variant="outline" type="button" onClick={() => setShowForm(false)} className="w-1/3">Cancel</Button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
