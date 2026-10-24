import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Package, AlertTriangle, ShoppingCart, Users, Truck, FileText, BarChart3, ClipboardList, Bell, Settings, ChevronLeft, ChevronRight, Activity, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/expiry-alerts', icon: AlertTriangle, label: 'Expiry Alerts', alertCount: 5 },
  { to: '/billing', icon: ShoppingCart, label: 'Billing / POS' },
  { type: 'divider' },
  { to: '/suppliers', icon: Truck, label: 'Suppliers' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/prescriptions', icon: ClipboardList, label: 'Prescriptions' },
  { type: 'divider' },
  { to: '/sales-history', icon: FileText, label: 'Sales History' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const { user } = useAuth();
  
  // Persist collapsed state
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('spms_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('spms_sidebar_collapsed', isCollapsed);
  }, [isCollapsed]);

  const sidebarWidth = isCollapsed ? '68px' : '260px';

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className="fixed inset-0 bg-[#0F172A]/80 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />}

      <motion.aside 
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={`fixed top-0 left-0 z-50 h-screen bg-[#0F172A] border-r border-white/5 text-white flex flex-col shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo Area */}
        <div className="flex items-center justify-between px-5 h-[72px] flex-shrink-0">
          <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[#0EA5E9] to-[#0284C7] flex items-center justify-center shadow-sm flex-shrink-0">
              <Activity size={18} className="text-white" />
            </div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <span className="text-xl font-bold font-heading tracking-tight">SPMS</span>
                  <span className="block text-[10px] text-[#0EA5E9] font-medium uppercase tracking-widest leading-none">Smart Pharmacy</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 text-white/50 hover:text-white rounded-md transition-colors"><X size={20} /></button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 space-y-1 scrollbar-hide">
          {navItems.map((item, i) => {
            if (item.type === 'divider') {
              return <div key={`div-${i}`} className="my-3 h-[1px] bg-white/10 mx-2" />;
            }

            const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => window.innerWidth < 1024 && onClose()}
                className={`group relative flex items-center h-[44px] rounded-lg font-medium transition-all duration-150 ${isActive ? 'text-[15px]' : 'text-[14px]'}`}
              >
                <div className={`absolute inset-0 rounded-lg transition-colors ${isActive ? 'bg-white/15' : 'group-hover:bg-white/5'}`} />
                {isActive && <motion.div layoutId="activeNavBorder" className="absolute left-0 top-1 bottom-1 w-[3px] bg-[#0EA5E9] rounded-r-full" />}
                
                <div className="relative flex items-center w-full px-3 gap-3">
                  <Icon size={20} className={`${isActive ? 'text-white' : 'text-white/70 group-hover:text-white'} transition-colors flex-shrink-0`} />
                  
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className={`font-heading whitespace-nowrap overflow-hidden flex-1 ${isActive ? 'text-white' : 'text-white/70 group-hover:text-white'} transition-colors`}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {item.alertCount && (
                    <span className={`flex-shrink-0 flex items-center justify-center bg-[#EF4444] text-white text-[10px] font-bold rounded-full h-5 ${isCollapsed ? 'absolute top-1 right-1 w-5' : 'px-2 min-w-[20px]'}`}>
                      {item.alertCount}
                    </span>
                  )}
                </div>

                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-semibold rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-lg">
                    {item.label}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer & Toggle */}
        <div className="mt-auto flex flex-col border-t border-white/10 relative">
          <div className="absolute -top-5 left-0 w-full flex justify-center">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:flex items-center justify-center h-10 w-10 rounded-full bg-[#0F172A] border border-white/10 hover:bg-white/10 transition-all shadow-lg z-10"
            >
              <ChevronLeft size={20} className={`text-white transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>
          
          <div className="p-3 pt-6">
            <div className={`flex items-center gap-3 bg-white/5 rounded-lg border border-white/10 transition-all overflow-hidden ${isCollapsed ? 'p-1.5 justify-center' : 'p-3'}`}>
              <div className="w-8 h-8 rounded-md bg-[#0EA5E9] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user?.full_name?.charAt(0) || 'A'}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate font-heading">{user?.full_name || 'Admin User'}</p>
                  <p className="text-[11px] text-[#94A3B8] truncate">{user?.role || 'Administrator'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
