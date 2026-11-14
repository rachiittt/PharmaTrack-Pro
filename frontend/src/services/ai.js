import { apiRequest } from '../lib/api';

/**
 * AI features run on the backend (the API key never reaches the browser).
 * Answers are read-only suggestions; invoice extraction returns a draft that
 * the user must review before it is saved as a purchase.
 */
export const aiStatus = (pharmacyId) => apiRequest(`/pharmacies/${pharmacyId}/ai/status`);

export const askAssistant = (pharmacyId, question, branchId = null) =>
  apiRequest(`/pharmacies/${pharmacyId}/ai/ask`, { method: 'POST', body: { question, branch_id: branchId }, timeout: 120000 });

export const extractInvoice = (pharmacyId, filePath) =>
  apiRequest(`/pharmacies/${pharmacyId}/ai/invoice-extract`, { method: 'POST', body: { file_path: filePath }, timeout: 180000 });
