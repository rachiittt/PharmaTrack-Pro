import { rpc } from '../lib/supabase';

/** Dashboard, alerts, reports and analytics — all computed in the database from live rows. */

export const dashboardSummary = (pharmacyId, branchId = null, days = 30) =>
  rpc('dashboard_summary', { p_pharmacy_id: pharmacyId, p_branch_id: branchId, p_days: days });

export const stockAlerts = (pharmacyId, branchId = null) =>
  rpc('stock_alerts', { p_pharmacy_id: pharmacyId, p_branch_id: branchId });

export const refreshAlertNotifications = (pharmacyId) =>
  rpc('refresh_alert_notifications', { p_pharmacy_id: pharmacyId });

export const salesReport = (pharmacyId, from, to, branchId = null) =>
  rpc('sales_report', { p_pharmacy_id: pharmacyId, p_from: from, p_to: to, p_branch_id: branchId });

export const reorderSuggestions = (pharmacyId, branchId = null, coverDays = 30, leadTimeDays = 5) =>
  rpc('reorder_suggestions', {
    p_pharmacy_id: pharmacyId, p_branch_id: branchId, p_lookback_days: 60,
    p_cover_days: coverDays, p_lead_time_days: leadTimeDays,
  });

export const expiryRisk = (pharmacyId, branchId = null, horizonDays = 180) =>
  rpc('expiry_risk', { p_pharmacy_id: pharmacyId, p_branch_id: branchId, p_horizon_days: horizonDays });
