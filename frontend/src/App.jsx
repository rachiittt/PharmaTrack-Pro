import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { SessionProvider, useSession } from './context/SessionContext';
import { AppShell } from './components/layout/AppShell';
import { RequirePermission } from './components/layout/RequirePermission';
import { ErrorState, PageLoader } from './components/ui/States';
import { homeFor } from './lib/roles';
import { LoginPage, SignupPage, ResetPasswordPage, SetupRequired } from './pages/Auth';
import Onboarding from './pages/Onboarding';
import NotFound from './pages/NotFound';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pos = lazy(() => import('./pages/Pos'));
const Inventory = lazy(() => import('./pages/Inventory'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Purchases = lazy(() => import('./pages/Purchases'));
const PurchaseNew = lazy(() => import('./pages/PurchaseNew'));
const PurchaseDetail = lazy(() => import('./pages/PurchaseDetail'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Sales = lazy(() => import('./pages/Sales'));
const SaleDetail = lazy(() => import('./pages/SaleDetail'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Reports = lazy(() => import('./pages/Reports'));
const Team = lazy(() => import('./pages/Team'));
const Settings = lazy(() => import('./pages/Settings'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Platform = lazy(() => import('./pages/Platform'));

function guard(permission, what, element) {
  return <RequirePermission permission={permission} what={what}>{element}</RequirePermission>;
}

function AppRoutes() {
  const { status, error, refresh, pharmacy, role, isPlatformAdmin } = useSession();

  if (status === 'unconfigured') return <SetupRequired />;
  if (status === 'loading') return <div className="min-h-screen bg-bg"><PageLoader label="Opening PharmaTrack…" /></div>;
  if (status === 'error') return <div className="min-h-screen bg-bg"><ErrorState error={error} onRetry={refresh} title="Could not load your account" /></div>;

  if (status === 'signed_out') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!pharmacy && !isPlatformAdmin) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Navigate to={homeFor(role)} replace />} />
        <Route path="/signup" element={<Navigate to={homeFor(role)} replace />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<AppShell />}>
          <Route index element={pharmacy ? (role === 'cashier' ? <Navigate to="/pos" replace /> : guard('dashboard.view', 'the dashboard', <Dashboard />)) : <Navigate to="/platform" replace />} />
          <Route path="pos" element={guard('pos.use', 'billing', <Pos />)} />
          <Route path="sales" element={guard('sales.view', 'sales', <Sales />)} />
          <Route path="sales/:id" element={guard('sales.view', 'sales', <SaleDetail />)} />
          <Route path="inventory" element={guard('inventory.view', 'inventory', <Inventory />)} />
          <Route path="inventory/:id" element={guard('inventory.view', 'inventory', <ProductDetail />)} />
          <Route path="alerts" element={guard('alerts.view', 'stock alerts', <Alerts />)} />
          <Route path="purchases" element={guard('purchases.view', 'purchases', <Purchases />)} />
          <Route path="purchases/new" element={guard('purchases.create', 'stock receiving', <PurchaseNew />)} />
          <Route path="purchases/:id" element={guard('purchases.view', 'purchases', <PurchaseDetail />)} />
          <Route path="suppliers" element={guard('suppliers.view', 'suppliers', <Suppliers />)} />
          <Route path="reports" element={guard('reports.view', 'reports', <Reports />)} />
          <Route path="assistant" element={guard('assistant.use', 'the assistant', <Assistant />)} />
          <Route path="team" element={guard('team.manage', 'staff management', <Team />)} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="platform" element={isPlatformAdmin ? <Platform /> : <NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: '13px', borderRadius: '10px', boxShadow: 'var(--shadow-pop)' },
            success: { iconTheme: { primary: 'var(--success)', secondary: 'var(--surface)' } },
            error: { iconTheme: { primary: 'var(--danger)', secondary: 'var(--surface)' }, duration: 5000 },
          }}
        />
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}
