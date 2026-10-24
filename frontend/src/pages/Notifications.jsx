import { useState, useEffect } from 'react';
import { Package, AlertTriangle, Clock, Activity, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';

const DEMO_NOTIFS = [
  { id: 1, title: 'Low Stock Alert', desc: 'Paracetamol 500mg is below minimum stock level (5/50). Please reorder soon.', time: '10 mins ago', type: 'warning', icon: Package, read: false },
  { id: 2, title: 'Expiry Warning', desc: 'Batch CR5001 of Crocin 500mg has expired. Please remove from shelves.', time: '1 hour ago', type: 'error', icon: AlertTriangle, read: false },
  { id: 3, title: 'System Update', desc: 'SPMS v4.0 is now live. Check out the new dashboard analytics features.', time: '2 hours ago', type: 'info', icon: Activity, read: true },
  { id: 4, title: 'Daily Report Ready', desc: 'Your end of day sales report for yesterday is ready to view.', time: '1 day ago', type: 'success', icon: CheckCircle2, read: true },
];

export default function Notifications() {
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    // Simulate loading
    setTimeout(() => setNotifs(DEMO_NOTIFS), 300);
  }, []);

  const markAllRead = () => {
    setNotifs(notifs.map(n => ({ ...n, read: true })));
  };

  const getColors = (type) => {
    switch (type) {
      case 'warning': return { text: 'text-[#F97316]', bg: 'bg-[#F97316]/10', border: 'border-[#F97316]/20' };
      case 'error': return { text: 'text-[#EF4444]', bg: 'bg-[#EF4444]/10', border: 'border-[#EF4444]/20' };
      case 'success': return { text: 'text-[#22C55E]', bg: 'bg-[#22C55E]/10', border: 'border-[#22C55E]/20' };
      default: return { text: 'text-[#0EA5E9]', bg: 'bg-[#0EA5E9]/10', border: 'border-[#0EA5E9]/20' };
    }
  };

  return (
    <div className="space-y-6 pb-10 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A] dark:text-[#F1F5F9] font-heading tracking-tight flex items-center gap-3">
            Notifications Center
          </h1>
          <div className="breadcrumb mt-1">
            <span className="text-[#64748B]">Dashboard</span> <span className="mx-2">/</span> <span className="text-[#0F172A] dark:text-[#F1F5F9]">Alerts & Logs</span>
          </div>
        </div>
        <Button variant="secondary" onClick={markAllRead}>Mark all as read</Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="card overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] dark:border-surface-700 bg-[#F8FAFC] dark:bg-surface-800/50">
          <div className="flex gap-2">
            <button className="px-4 py-1.5 text-[13px] font-bold rounded bg-[#0EA5E9]/10 text-[#0EA5E9] transition-colors">All</button>
            <button className="px-4 py-1.5 text-[13px] font-bold rounded text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors">Unread</button>
          </div>
        </div>

        <div className="divide-y divide-[#E2E8F0] dark:divide-surface-700">
          <AnimatePresence>
            {notifs.map(n => {
              const colors = getColors(n.type);
              return (
                <motion.div key={n.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-5 flex gap-4 transition-colors hover:bg-[#F8FAFC] dark:hover:bg-surface-800/50 ${!n.read ? 'bg-sky-50/30 dark:bg-surface-800' : ''}`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border ${colors.bg} ${colors.text} ${colors.border}`}>
                    <n.icon size={20} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <p className={`font-bold font-heading ${!n.read ? 'text-[#0F172A] dark:text-white' : 'text-[#475569] dark:text-surface-300'}`}>{n.title}</p>
                      <span className="text-xs font-semibold text-[#64748B] whitespace-nowrap pt-0.5">{n.time}</span>
                    </div>
                    <p className={`text-sm font-sans mt-1 ${!n.read ? 'text-[#475569] dark:text-surface-300 font-medium' : 'text-[#64748B]'}`}>{n.desc}</p>
                    {!n.read && (
                      <div className="mt-3 flex gap-3">
                        <button className="text-xs font-bold text-[#0EA5E9] hover:text-[#0284C7] transition-colors">View Details</button>
                        <button onClick={() => setNotifs(notifs.map(x => x.id === n.id ? { ...x, read: true } : x))} className="text-xs font-bold text-[#64748B] hover:text-[#0F172A] transition-colors">Mark as read</button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
