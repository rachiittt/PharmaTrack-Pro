import { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { SlideOver } from '../components/ui/Modal';
import { Search, Plus, FileText, CheckCircle, Clock, XCircle, User, Activity, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const DEMO_PRESCRIPTIONS = [
  { id: '1', patient: 'Ramesh Kumar', doctor: 'Dr. S. Patil', date: '2026-04-26', status: 'filled', items: 4, notes: 'Take after meals' },
  { id: '2', patient: 'Sunita Sharma', doctor: 'Dr. A. Desai', date: '2026-04-27', status: 'pending', items: 2, notes: 'Urgent refill' },
  { id: '3', patient: 'Amit Singh', doctor: 'Dr. K. Mehta', date: '2026-04-25', status: 'cancelled', items: 1, notes: 'Patient changed mind' },
  { id: '4', patient: 'Priya Verma', doctor: 'Dr. S. Patil', date: '2026-04-27', status: 'pending', items: 3, notes: '' },
];

export default function Prescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    setIsDemo(JSON.parse(localStorage.getItem('spms_demo') || 'false'));
    setLoading(true);
    setTimeout(() => {
      let data = [...DEMO_PRESCRIPTIONS];
      if (search) data = data.filter(p => p.patient.toLowerCase().includes(search.toLowerCase()) || p.doctor.toLowerCase().includes(search.toLowerCase()));
      setPrescriptions(data);
      setLoading(false);
    }, 300);
  }, [search]);

  const StatusIcon = ({ status }) => {
    if (status === 'filled') return <CheckCircle size={16} className="text-[#22C55E]" />;
    if (status === 'pending') return <Clock size={16} className="text-[#EAB308]" />;
    return <XCircle size={16} className="text-[#EF4444]" />;
  };

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A] dark:text-[#F1F5F9] font-heading tracking-tight flex items-center gap-3">
            Prescriptions
          </h1>
          <div className="breadcrumb mt-1">
            <span className="text-[#64748B]">Dashboard</span> <span className="mx-2">/</span> <span className="text-[#0F172A] dark:text-[#F1F5F9]">Prescriptions Log</span>
          </div>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={16} className="mr-1" /> Add Prescription
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-5 flex items-center gap-4 hover:border-[#0EA5E9]/50 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-[#0EA5E9]/10 text-[#0EA5E9] flex items-center justify-center"><FileText size={24} /></div>
          <div><p className="text-[12px] font-bold font-heading text-[#64748B] uppercase tracking-wider">Total Files</p><p className="text-[28px] font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9] leading-none mt-1">142</p></div>
        </div>
        <div className="card p-5 flex items-center gap-4 hover:border-[#EAB308]/50 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-[#EAB308]/10 text-[#EAB308] flex items-center justify-center"><Clock size={24} /></div>
          <div><p className="text-[12px] font-bold font-heading text-[#64748B] uppercase tracking-wider">Pending Fills</p><p className="text-[28px] font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9] leading-none mt-1">12</p></div>
        </div>
        <div className="card p-5 flex items-center gap-4 hover:border-[#22C55E]/50 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-[#22C55E]/10 text-[#22C55E] flex items-center justify-center"><CheckCircle size={24} /></div>
          <div><p className="text-[12px] font-bold font-heading text-[#64748B] uppercase tracking-wider">Completed Today</p><p className="text-[28px] font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9] leading-none mt-1">28</p></div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="card overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[#E2E8F0] dark:border-surface-700 bg-[#F8FAFC] dark:bg-surface-800/50">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient or doctor..." className="input-field pl-9" />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-surface-500">Loading...</div>
        ) : prescriptions.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-surface-100 dark:bg-surface-800 rounded-full flex items-center justify-center mb-4 text-[#0EA5E9]">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] mb-1">No prescriptions found</h3>
            <p className="text-[#64748B] mb-6">No records match your search criteria.</p>
            <Button onClick={() => setShowForm(true)}><Plus size={16} /> Add First Prescription</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="table-header">
                  <th className="px-6 py-4 font-semibold">Patient & Doctor</th>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Items</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-surface-700 text-sm">
                <AnimatePresence>
                  {prescriptions.map(p => (
                    <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="table-row group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-[#F8FAFC] dark:bg-surface-800 border border-[#E2E8F0] dark:border-surface-600 flex items-center justify-center text-[#1E3A5F] dark:text-[#0EA5E9] font-bold group-hover:scale-110 transition-transform">
                            {p.patient.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-[#0F172A] dark:text-[#F1F5F9]">{p.patient}</p>
                            <p className="text-[12px] font-medium text-[#64748B] flex items-center gap-1 mt-0.5"><User size={12}/> {p.doctor}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-[#475569] dark:text-[#F1F5F9] font-sans">{p.date}</td>
                      <td className="px-6 py-4 font-bold text-[#0F172A] dark:text-[#F1F5F9] font-sans">{p.items} meds</td>
                      <td className="px-6 py-4">
                        <Badge variant={p.status === 'filled' ? 'success' : p.status === 'pending' ? 'warning' : 'danger'} className="flex inline-flex items-center gap-1.5 w-fit">
                          <StatusIcon status={p.status} /> {p.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" className="font-bold">View</Button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <SlideOver isOpen={showForm} onClose={() => setShowForm(false)} title="Upload Prescription">
        <div className="flex flex-col h-full">
          <div className="flex-1 space-y-6 pb-10">
            <div className="border-2 border-dashed border-[#0EA5E9]/30 bg-[#0EA5E9]/5 rounded-xl p-8 text-center hover:bg-[#0EA5E9]/10 transition-colors cursor-pointer group">
              <div className="w-14 h-14 bg-white dark:bg-surface-800 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm group-hover:scale-110 transition-transform">
                <ImageIcon size={24} className="text-[#0EA5E9]" />
              </div>
              <p className="text-sm font-bold font-heading text-[#1E3A5F] dark:text-[#F1F5F9]">Click to upload Rx image or PDF</p>
              <p className="text-xs font-medium font-sans text-[#0EA5E9] mt-1">Max file size 5MB</p>
            </div>

            <section>
              <h4 className="text-[12px] font-bold text-[#0EA5E9] uppercase tracking-wider mb-4 font-heading border-b border-[#E2E8F0] dark:border-surface-700 pb-2">Details</h4>
              <div className="space-y-4">
                <div><label className="form-label">Patient Name *</label><input className="input-field" placeholder="e.g. Ramesh Kumar" /></div>
                <div><label className="form-label">Doctor Name *</label><input className="input-field" placeholder="e.g. Dr. S. Patil" /></div>
                <div><label className="form-label">Notes</label><textarea className="input-field h-24 resize-none" placeholder="Dosage instructions..." /></div>
              </div>
            </section>
          </div>
          
          <div className="pt-5 border-t border-[#E2E8F0] dark:border-surface-700 mt-auto bg-white dark:bg-surface-800 -mx-6 px-6 -mb-6 pb-6 pt-4 sticky bottom-0">
            <Button className="w-full" onClick={() => { toast.success('Prescription logged (Demo)'); setShowForm(false); }}>Save Prescription</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
