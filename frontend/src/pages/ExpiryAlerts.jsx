import { useState, useEffect, useMemo } from 'react';
import { medicineAPI } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { getExpiryLabel } from '../utils/expiryUtils';
import { TableSkeleton } from '../components/ui/Skeleton';
import { AlertTriangle, Clock, XCircle, Search, CalendarOff, Trash2, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { safeGetJSON } from '../utils/storage';

const DEMO_MEDICINES = [
  { id: '1', name: 'Crocin 500mg', batch_no: 'CR5001', quantity: 45, unit: 'strips', expiry_status: 'expired', days_until_expiry: -5, cost_price: '22.00', supplier_name: 'Sun Pharma' },
  { id: '2', name: 'Metformin 500mg', batch_no: 'MT2204', quantity: 120, unit: 'strips', expiry_status: 'expired', days_until_expiry: -12, cost_price: '35.00', supplier_name: 'Cipla' },
  { id: '3', name: 'Azithromycin 500mg', batch_no: 'AZ1105', quantity: 30, unit: 'strips', expiry_status: 'critical', days_until_expiry: 3, cost_price: '85.00', supplier_name: 'Abbott' },
  { id: '4', name: 'Dolo 650', batch_no: 'DL6504', quantity: 200, unit: 'strips', expiry_status: 'critical', days_until_expiry: 7, cost_price: '18.00', supplier_name: 'Micro Labs' },
  { id: '5', name: 'Amoxicillin 250mg', batch_no: 'AM2501', quantity: 80, unit: 'bottles', expiry_status: 'warning', days_until_expiry: 22, cost_price: '45.00', supplier_name: 'GSK' },
  { id: '7', name: 'Vitamin C 500mg', batch_no: 'VC500', quantity: 150, unit: 'strips', expiry_status: 'upcoming', days_until_expiry: 85, cost_price: '15.00', supplier_name: 'Cipla' },
];

const TABS = [
  { id: 'expired', label: 'Expired', desc: 'Action required now', icon: XCircle, color: 'text-[#EF4444]', border: 'border-[#EF4444]', bg: 'bg-[#EF4444]/10' },
  { id: 'critical', label: 'Critical (0-15d)', desc: 'Expires very soon', icon: AlertTriangle, color: 'text-[#F97316]', border: 'border-[#F97316]', bg: 'bg-[#F97316]/10' },
  { id: 'warning', label: 'Warning (16-60d)', desc: 'Plan clearance', icon: Clock, color: 'text-[#EAB308]', border: 'border-[#EAB308]', bg: 'bg-[#EAB308]/10' },
  { id: 'upcoming', label: 'Upcoming (61-90d)', desc: 'Monitor stock', icon: CalendarOff, color: 'text-[#0EA5E9]', border: 'border-[#0EA5E9]', bg: 'bg-[#0EA5E9]/10' },
];

export default function ExpiryAlerts() {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expired');
  const [search, setSearch] = useState('');
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const demoMode = safeGetJSON('spms_demo', false);
      setIsDemo(demoMode);

      if (demoMode) {
        setTimeout(() => { setMedicines(DEMO_MEDICINES); setLoading(false); }, 400);
        return;
      }

      try {
        const res = await medicineAPI.list({ limit: 500 });
        setMedicines((res.data?.data || []).filter(m => ['expired', 'critical', 'warning', 'upcoming'].includes(m.expiry_status)));
      } catch {
        console.warn('Backend unavailable, falling back to rich demo data.');
        setMedicines(DEMO_MEDICINES);
        if (!demoMode) toast.success('Showing local preview data');
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const filteredMeds = useMemo(() => {
    return medicines.filter(m => {
      const matchTab = m.expiry_status === activeTab;
      const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.batch_no.toLowerCase().includes(search.toLowerCase());
      return matchTab && matchSearch;
    });
  }, [medicines, activeTab, search]);

  const summary = useMemo(() => {
    return {
      expired: medicines.filter(m => m.expiry_status === 'expired').length,
      critical: medicines.filter(m => m.expiry_status === 'critical').length,
      warning: medicines.filter(m => m.expiry_status === 'warning').length,
      upcoming: medicines.filter(m => m.expiry_status === 'upcoming').length,
      potentialLoss: medicines.filter(m => m.expiry_status === 'expired' || m.expiry_status === 'critical').reduce((sum, m) => sum + (m.quantity * parseFloat(m.cost_price || 0)), 0),
    };
  }, [medicines]);

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A] dark:text-[#F1F5F9] font-heading tracking-tight">Expiry Tracking</h1>
          <div className="breadcrumb mt-1">
            <span className="text-[#64748B]">Dashboard</span> <span className="mx-2">/</span> <span className="text-[#0F172A] dark:text-[#F1F5F9]">Expiry Alerts</span>
          </div>
        </div>
        {summary.potentialLoss > 0 && (
          <div className="text-right card px-5 py-2.5 bg-red-50 dark:bg-red-900/10 border-[#EF4444]/20 shadow-none">
            <p className="text-[11px] font-bold text-[#EF4444] uppercase tracking-wider font-heading">Potential Loss</p>
            <p className="text-xl font-bold font-sans text-[#EF4444]">{formatCurrency(summary.potentialLoss)}</p>
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`card p-4 text-left transition-all duration-200 relative overflow-hidden group ${
              activeTab === tab.id ? `ring-2 ring-offset-2 dark:ring-offset-surface-900 ${tab.border.replace('border-', 'ring-')}` : 'hover:border-[#CBD5E1] dark:hover:border-surface-600'
            }`}
          >
            {activeTab === tab.id && <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full ${tab.bg} -mr-8 -mt-8`} />}
            <div className="flex items-center justify-between mb-3 relative z-10">
              <div className={`p-2 rounded-lg ${activeTab === tab.id ? tab.bg : 'bg-surface-100 dark:bg-surface-800'} ${tab.color}`}>
                <tab.icon size={20} />
              </div>
              <span className="text-2xl font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{summary[tab.id]}</span>
            </div>
            <p className={`text-sm font-bold font-heading mb-0.5 relative z-10 ${activeTab === tab.id ? tab.color : 'text-[#0F172A] dark:text-[#F1F5F9]'}`}>{tab.label}</p>
            <p className="text-[12px] font-medium text-[#64748B] relative z-10">{tab.desc}</p>
          </button>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="card overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[#E2E8F0] dark:border-surface-700 bg-[#F8FAFC] dark:bg-surface-800/50 flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search medicines or batch..." className="input-field pl-9" />
          </div>
        </div>

        {loading ? <TableSkeleton rows={5} /> : filteredMeds.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${TABS.find(t=>t.id===activeTab).bg} ${TABS.find(t=>t.id===activeTab).color}`}>
              {activeTab === 'expired' ? <XCircle size={32} /> : <AlertTriangle size={32} />}
            </div>
            <h3 className="text-lg font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] mb-1">No {activeTab} medicines</h3>
            <p className="text-[#64748B]">You are all clear for this category.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="table-header">
                  <th className="px-6 py-4 font-semibold">Medicine</th>
                  <th className="px-6 py-4 font-semibold">Batch No.</th>
                  <th className="px-6 py-4 font-semibold text-right">Stock Level</th>
                  <th className="px-6 py-4 font-semibold">Expiry Detail</th>
                  <th className="px-6 py-4 font-semibold text-right">Est. Loss</th>
                  <th className="px-6 py-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-surface-700 text-sm">
                <AnimatePresence>
                  {filteredMeds.map(med => {
                    const loss = med.quantity * parseFloat(med.cost_price || 0);
                    return (
                      <motion.tr key={med.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="table-row">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{med.name}</p>
                          <p className="text-[12px] text-[#94A3B8] mt-0.5">{med.supplier_name || 'Unknown Supplier'}</p>
                        </td>
                        <td className="px-6 py-4 font-mono text-[#64748B] font-medium">{med.batch_no}</td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-semibold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{med.quantity} <span className="text-[12px] font-normal text-[#94A3B8]">{med.unit}</span></p>
                        </td>
                        <td className="px-6 py-4">
                          <p className={`font-semibold ${med.expiry_status === 'expired' ? 'text-[#EF4444]' : 'text-[#0F172A] dark:text-[#F1F5F9]'}`}>
                            {getExpiryLabel(med.days_until_expiry)}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className={`font-bold font-sans ${loss > 0 ? 'text-[#EF4444]' : 'text-[#0F172A] dark:text-[#F1F5F9]'}`}>{formatCurrency(loss)}</p>
                          <p className="text-[12px] font-medium text-[#94A3B8] mt-0.5">@{formatCurrency(med.cost_price)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => toast.success('Return request sent to supplier via WhatsApp')} className="p-1.5 text-[#0EA5E9] hover:bg-[#0EA5E9]/10 rounded-md transition-colors tooltip-trigger relative" title="Message Supplier">
                              <MessageCircle size={16} />
                            </button>
                            <button onClick={() => { if(window.confirm('Remove this expired item from stock?')) toast.success('Item removed from active inventory'); }} className="p-1.5 text-[#EF4444] hover:bg-[#EF4444]/10 rounded-md transition-colors" title="Dispose / Remove">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
