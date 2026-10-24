import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { motion, AnimatePresence } from 'framer-motion';

export function PageShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('spms_sidebar_collapsed') === 'true');
  const location = useLocation();

  // Listen for changes to sidebar collapse state from within the sidebar
  useEffect(() => {
    const handleStorageChange = () => {
      setIsCollapsed(localStorage.getItem('spms_sidebar_collapsed') === 'true');
    };
    window.addEventListener('storage', handleStorageChange);
    const intervalId = setInterval(() => {
      const current = localStorage.getItem('spms_sidebar_collapsed') === 'true';
      if (current !== isCollapsed) setIsCollapsed(current);
    }, 200);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(intervalId);
    };
  }, [isCollapsed]);

  const marginLeft = isCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[260px]';

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] flex transition-colors">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${marginLeft}`}>
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div 
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto max-w-7xl"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
