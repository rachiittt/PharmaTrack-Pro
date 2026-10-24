import axios from 'axios';
import { safeGetJSON, safeRemove } from '../utils/storage';

const api = axios.create({ baseURL: '/api', timeout: 4000 });

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  const session = safeGetJSON('spms_session', null);
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const isDemo = safeGetJSON('spms_demo', false);
      if (!isDemo) {
        safeRemove('spms_session');
        safeRemove('spms_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ============================================
// Auth
// ============================================
export const authAPI = {
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
};

// ============================================
// Medicines
// ============================================
export const medicineAPI = {
  list: (params) => api.get('/medicines', { params }),
  get: (id) => api.get(`/medicines/${id}`),
  create: (data) => api.post('/medicines', data),
  update: (id, data) => api.put(`/medicines/${id}`, data),
  delete: (id) => api.delete(`/medicines/${id}`),
  barcodeLookup: (code) => api.get(`/medicines/barcode/${code}`),
  lookupBarcode: (code) => api.get(`/medicines/lookup-barcode/${code}`),
  bulkImport: (medicines) => api.post('/medicines/bulk-import', { medicines }),
};

// ============================================
// Suppliers
// ============================================
export const supplierAPI = {
  list: () => api.get('/suppliers'),
  get: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
};

// ============================================
// Customers
// ============================================
export const customerAPI = {
  list: (params) => api.get('/customers', { params }),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
};

// ============================================
// Prescriptions
// ============================================
export const prescriptionAPI = {
  list: (params) => api.get('/prescriptions', { params }),
  get: (id) => api.get(`/prescriptions/${id}`),
  create: (data) => api.post('/prescriptions', data),
  update: (id, data) => api.put(`/prescriptions/${id}`, data),
};

// ============================================
// Sales
// ============================================
export const salesAPI = {
  create: (data) => api.post('/sales', data),
  list: (params) => api.get('/sales', { params }),
  get: (id) => api.get(`/sales/${id}`),
  receipt: (id) => api.get(`/sales/${id}/receipt`),
};

// ============================================
// Alerts
// ============================================
export const alertAPI = {
  summary: () => api.get('/alerts/summary'),
  medicines: (params) => api.get('/alerts/medicines', { params }),
};

// ============================================
// Analytics
// ============================================
export const analyticsAPI = {
  dashboard: () => api.get('/analytics/dashboard'),
  topSellers: (days) => api.get('/analytics/top-sellers', { params: { days } }),
  salesTrend: (days) => api.get('/analytics/sales-trend', { params: { days } }),
  categoryBreakdown: () => api.get('/analytics/category-breakdown'),
  paymentMethods: () => api.get('/analytics/payment-methods'),
};

// ============================================
// Notifications
// ============================================
export const notificationAPI = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  sendTest: () => api.post('/notifications/send-test'),
};

// ============================================
// Reports (CSV download + GST JSON)
// ============================================
export const reportsAPI = {
  inventory: () => api.get('/reports/inventory', { responseType: 'blob', timeout: 30000 }),
  sales: (params) => api.get('/reports/sales', { params, responseType: 'blob', timeout: 30000 }),
  expiry: () => api.get('/reports/expiry', { responseType: 'blob', timeout: 30000 }),
  gst: (params) => api.get('/reports/gst', { params }),
};

export default api;
