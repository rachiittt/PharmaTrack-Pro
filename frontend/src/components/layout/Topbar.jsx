import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Search, Bell, Moon, Sun, ChevronDown, Package, AlertTriangle, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/inventory': 'Inventory',
  '/expiry-alerts': 'Expiry Alerts',
  '/billing': 'Billing / POS',
  '/suppliers': 'Suppliers',
  '/customers': 'Customers',
  '/prescriptions': 'Prescriptions',
  '/sales-history': 'Sales History',
  '/analytics': 'Analytics',
  '/notifications': 'Notifications',
  '/settings': 'Settings'
};

const DEMO_NOTIFS = [
  { id: 1, title: 'Low Stock Alert', desc: 'Paracetamol 500mg is below minimum.', time: '10m ago', icon: Package, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  { id: 2, title: 'Expiry Warning', desc: '3 items expiring in 15 days.', time: '1h ago', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
  { id: 3, title: 'System Update', desc: 'SPMS v4.0 is now live.', time: '2h ago', icon: Clock, color: 'text-[#0EA5E9]', bg: 'bg-sky-50 dark:bg-sky-900/20' },
];

export function Topbar({ onMenuClick }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const title = PAGE_TITLES[location.pathname] || PAGE_TITLES[`/${location.pathname.split('/')[1]}`] || 'Dashboard';

  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
    localStorage.setItem('spms_theme', !isDark ? 'dark' : 'light');
  };

  return (
    <header className="h-[64px] bg-white dark:bg-[#1E293B] border-b border-[#E2E8F0] dark:border-[#334155] flex items-center justify-between px-4 lg:px-8 flex-shrink-0 z-30 transition-colors">
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="lg:hidden p-2 -ml-2 text-surface-500 hover:text-[#0F172A] dark:hover:text-white rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
          <Menu size={24} />
        </button>
        <h2 className="text-xl font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] tracking-tight">{title}</h2>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="relative hidden sm:block group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-[#64748B] group-focus-within:text-[#0EA5E9] transition-colors" />
          </div>
          <input 
            type="text" 
            placeholder="Search medicines, invoices, or customers..." 
            className="w-[280px] lg:w-[320px] pl-10 pr-4 py-2 bg-surface-50 dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg text-[13px] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all placeholder:text-[#94A3B8]"
          />
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none hidden lg:flex">
            <span className="text-[10px] font-bold text-[#64748B] bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] px-1.5 py-0.5 rounded shadow-sm">⌘K</span>
          </div>
        </div>

        <button onClick={toggleDark} className="p-2 text-surface-500 hover:text-[#0F172A] dark:hover:text-white rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button onClick={() => { setShowNotifs(!showNotifs); setShowProfile(false); }} className="relative p-2 text-surface-500 hover:text-[#0F172A] dark:hover:text-white rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
            <Bell size={20} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#EF4444] rounded-full border-2 border-white dark:border-[#1E293B]" />
          </button>

          <AnimatePresence>
            {showNotifs && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-xl shadow-lg z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#334155] flex justify-between items-center bg-[#F8FAFC] dark:bg-[#0F172A]">
                    <h3 className="font-semibold font-heading text-[#0F172A] dark:text-[#F1F5F9]">Notifications</h3>
                    <span className="text-xs bg-[#0EA5E9] text-white px-2 py-0.5 rounded-full font-bold">3 New</span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {DEMO_NOTIFS.map((n) => (
                      <div key={n.id} className="p-4 border-b border-[#E2E8F0] dark:border-[#334155] hover:bg-[#F8FAFC] dark:hover:bg-surface-800 transition-colors flex gap-3 cursor-pointer">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.bg} ${n.color}`}>
                          <n.icon size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold font-heading text-[#0F172A] dark:text-[#F1F5F9]">{n.title}</p>
                          <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-0.5">{n.desc}</p>
                          <p className="text-[10px] text-[#94A3B8] dark:text-[#64748B] mt-1 font-medium">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <a href="/notifications" className="block text-center px-4 py-3 text-sm font-semibold text-[#0EA5E9] hover:bg-[#F8FAFC] dark:hover:bg-surface-800 transition-colors">
                    View All Notifications
                  </a>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="h-6 w-px bg-[#E2E8F0] dark:bg-[#334155] mx-2 hidden sm:block" />

        {/* Profile Dropdown */}
        <div className="relative">
          <button onClick={() => { setShowProfile(!showProfile); setShowNotifs(false); }} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-[#0EA5E9] flex items-center justify-center text-white text-xs font-bold">
              {user?.full_name?.charAt(0) || 'A'}
            </div>
            <ChevronDown size={16} className="text-surface-400 hidden sm:block" />
          </button>

          <AnimatePresence>
            {showProfile && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-xl shadow-lg z-50 overflow-hidden py-1"
                >
                  <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#334155] mb-1">
                    <p className="text-sm font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] truncate">{user?.full_name || 'Admin User'}</p>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] truncate">{user?.email || 'admin@spms.com'}</p>
                  </div>
                  <a href="/settings" className="block px-4 py-2 text-sm text-[#475569] dark:text-[#F1F5F9] hover:bg-[#F8FAFC] dark:hover:bg-surface-800 transition-colors">Settings</a>
                  <button onClick={() => { logout(); window.location.href = '/login'; }} className="w-full text-left px-4 py-2 text-sm text-[#EF4444] hover:bg-[#F8FAFC] dark:hover:bg-surface-800 transition-colors font-medium">Log out</button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
