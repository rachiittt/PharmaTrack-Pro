import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { alertAPI } from '../services/api';
import { safeGetJSON } from '../utils/storage';

const AlertContext = createContext(null);

// Demo alert data when backend is unavailable
const DEMO_ALERT_SUMMARY = {
  expired: 5,
  critical: 8,
  warning: 12,
  upcoming: 10,
  low_stock: 6,
};

export function AlertProvider({ children }) {
  const [alertSummary, setAlertSummary] = useState({ expired: 0, critical: 0, warning: 0, upcoming: 0, low_stock: 0 });

  const fetchAlerts = useCallback(async () => {
    // Only fetch if we have a valid session — avoids unauthenticated 401s on login page
    const session = safeGetJSON('spms_session', null);
    if (!session?.access_token) return;

    try {
      const res = await alertAPI.summary();
      setAlertSummary(res.data);
    } catch (err) {
      // If backend unavailable and we're in demo mode, use demo data
      const isDemo = safeGetJSON('spms_demo', false);
      if (isDemo) {
        setAlertSummary(DEMO_ALERT_SUMMARY);
      }
      // Otherwise silently fail — user may not be logged in
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  return (
    <AlertContext.Provider value={{ alertSummary, refreshAlerts: fetchAlerts }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlertContext() {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlertContext must be inside AlertProvider');
  return context;
}
