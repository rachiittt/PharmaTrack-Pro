import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { AlertProvider } from './context/AlertContext';
import { PageShell } from './components/layout/PageShell';

// Lazy-loaded pages
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const ExpiryAlerts = lazy(() => import('./pages/ExpiryAlerts'));
const Billing = lazy(() => import('./pages/Billing'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Customers = lazy(() => import('./pages/Customers'));
const Prescriptions = lazy(() => import('./pages/Prescriptions'));
const SalesHistory = lazy(() => import('./pages/SalesHistory'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Settings = lazy(() => import('./pages/Settings'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] flex">
      {/* Sidebar skeleton */}
      <div className="hidden lg:flex flex-col w-[260px] bg-white dark:bg-[#1E293B] border-r border-[#E2E8F0] dark:border-[#334155] p-4 gap-3">
        <div className="h-10 w-32 bg-[#E2E8F0] dark:bg-[#334155] rounded-lg animate-pulse mb-4" />
        {Array(8).fill(0).map((_, i) => (
          <div key={i} className="h-9 bg-[#E2E8F0] dark:bg-[#334155] rounded-lg animate-pulse" style={{ width: `${60 + Math.random() * 30}%`, opacity: 0.3 + (i < 3 ? 0.5 : 0) }} />
        ))}
      </div>
      {/* Content skeleton */}
      <div className="flex-1 p-6 lg:p-8 space-y-6">
        <div className="h-8 w-64 bg-[#E2E8F0] dark:bg-[#334155] rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-[130px] bg-white dark:bg-[#1E293B] rounded-xl border border-[#E2E8F0] dark:border-[#334155] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 h-[340px] bg-white dark:bg-[#1E293B] rounded-xl border border-[#E2E8F0] dark:border-[#334155] animate-pulse" />
          <div className="h-[340px] bg-white dark:bg-[#1E293B] rounded-xl border border-[#E2E8F0] dark:border-[#334155] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Load saved theme
  useEffect(() => {
    try {
      const theme = localStorage.getItem('spms_theme');
      if (theme === 'dark') document.documentElement.classList.add('dark');
    } catch {}
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AlertProvider>
          <CartProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: { background: '#1e293b', color: '#f1f5f9', fontSize: '13px', borderRadius: '12px', padding: '12px 16px' },
                success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
                error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
              }}
            />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route element={<PageShell />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/expiry-alerts" element={<ExpiryAlerts />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route path="/suppliers" element={<Suppliers />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/prescriptions" element={<Prescriptions />} />
                  <Route path="/sales-history" element={<SalesHistory />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </CartProvider>
        </AlertProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
