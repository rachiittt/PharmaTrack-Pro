import { useState, useEffect, useCallback } from 'react';
import { medicineAPI, supplierAPI } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { getExpiryStatus, getExpiryLabel } from '../utils/expiryUtils';
import { ExpiryBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { SlideOver } from '../components/ui/Modal';
import { TableSkeleton } from '../components/ui/Skeleton';
import { Plus, Search, Download, MoreHorizontal, PackageOpen, ChevronLeft, ChevronRight, Edit2, Trash2, ScanLine, Package, AlertTriangle, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { parseExcel, validateRows, downloadTemplate } from '../utils/bulkImportUtils';
import { safeGetJSON } from '../utils/storage';

const CATEGORIES = ['All Categories', 'Tablet', 'Capsule', 'Syrup', 'Injection', 'Topical', 'Other'];

const DEMO_INVENTORY = [
  { id: '1', name: 'Dolo 650', generic_name: 'Paracetamol', batch_no: 'DL2309', category: 'Tablet', quantity: 345, unit: 'strips', cost_price: 22.50, selling_price: 30.00, mrp: 33.00, expiry_status: 'healthy', is_low_stock: false },
  { id: '2', name: 'Azithral 500', generic_name: 'Azithromycin', batch_no: 'AZ5511', category: 'Tablet', quantity: 120, unit: 'strips', cost_price: 110.00, selling_price: 135.00, mrp: 142.00, expiry_status: 'healthy', is_low_stock: false },
  { id: '3', name: 'Pantocid 40', generic_name: 'Pantoprazole', batch_no: 'PT4002', category: 'Tablet', quantity: 15, unit: 'strips', cost_price: 130.00, selling_price: 160.00, mrp: 165.00, expiry_status: 'healthy', is_low_stock: true },
  { id: '4', name: 'Corex DX', generic_name: 'Chlorpheniramine', batch_no: 'CX8890', category: 'Syrup', quantity: 45, unit: 'bottles', cost_price: 85.00, selling_price: 115.00, mrp: 120.00, expiry_status: 'warning', is_low_stock: false },
  { id: '5', name: 'Augmentin 625', generic_name: 'Amoxicillin', batch_no: 'AG6259', category: 'Tablet', quantity: 8, unit: 'strips', cost_price: 175.00, selling_price: 220.00, mrp: 235.00, expiry_status: 'warning', is_low_stock: true },
];

export default function Inventory() {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All Categories');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editingMed, setEditingMed] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [recentlyAddedId, setRecentlyAddedId] = useState(null);

  const [formData, setFormData] = useState({
    name: '', generic_name: '', batch_no: '', category: 'Tablet',
    quantity: 0, min_stock_level: 10, cost_price: '', selling_price: '', mrp: '', expiry_date: ''
  });

  const fetchMedicines = useCallback(async () => {
    setLoading(true);
    try {
      const demoMode = safeGetJSON('spms_demo', false);
      setIsDemo(demoMode);

      if (demoMode) {
        let filtered = [...DEMO_INVENTORY];
        if (search) filtered = filtered.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.batch_no.toLowerCase().includes(search.toLowerCase()));
        if (category !== 'All Categories') filtered = filtered.filter(m => m.category === category);
        setMedicines(filtered);
        setTotal(filtered.length);
      } else {
        const params = { page, limit: 20, search: search || undefined, category: category !== 'All Categories' ? category : undefined };
        const res = await medicineAPI.list(params);
        setMedicines(res.data?.data || []);
        setTotal(res.data?.total || 0);
      }
    } catch {
      console.warn('Backend unavailable, falling back to rich demo data.');
      let filtered = [...DEMO_INVENTORY];
      if (search) filtered = filtered.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.batch_no.toLowerCase().includes(search.toLowerCase()));
      if (category !== 'All Categories') filtered = filtered.filter(m => m.category === category);
      setMedicines(filtered);
      setTotal(filtered.length);
      const isDemo = safeGetJSON('spms_demo', false);
      if (!isDemo && page === 1) toast.success('Showing local preview data');
    } finally {
      setLoading(false);
    }
  }, [page, search, category]);

  useEffect(() => { fetchMedicines(); }, [fetchMedicines]);

  useEffect(() => {
    const demoMode = safeGetJSON('spms_demo', false);
    if (!demoMode) supplierAPI.list().then(r => setSuppliers(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { const t = setTimeout(() => setPage(1), 300); return () => clearTimeout(t); }, [search]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (isDemo) {
      setTimeout(() => {
        toast.success(editingMed ? 'Medicine updated' : 'Medicine added');
        if (!editingMed) setRecentlyAddedId('1'); // Simulate flash effect
        setShowForm(false);
        setEditingMed(null);
        setSaving(false);
        setTimeout(() => setRecentlyAddedId(null), 1000);
      }, 600);
      return;
    }
    // Real save logic would go here
    setSaving(false);
  };

  const handleSimulatedScan = () => {
    setShowScanner(true);
    setTimeout(() => {
      setFormData({
        ...formData,
        name: 'Aspirin 500mg',
        generic_name: 'Acetylsalicylic acid',
        batch_no: 'AS9901B',
        category: 'Tablet',
        cost_price: '15.00',
        selling_price: '25.00',
        mrp: '28.00',
      });
      setShowScanner(false);
      setShowForm(true);
      toast.success('QR Code scanned! Data auto-filled.');
    }, 2000);
  };

  const margin = formData.cost_price && formData.selling_price 
    ? (((formData.selling_price - formData.cost_price) / formData.selling_price) * 100).toFixed(1) 
    : 0;

  return (
    <div className="space-y-6 pb-10 max-w-[1400px] mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A] dark:text-[#F1F5F9] font-heading tracking-tight">Inventory</h1>
          <div className="breadcrumb mt-1">
            <span className="text-[#64748B]">Dashboard</span> <span className="mx-2">/</span> <span className="text-[#0F172A] dark:text-[#F1F5F9]">Inventory Database</span>
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Button variant="outline" className="hidden sm:flex border-[#0EA5E9] text-[#0EA5E9] hover:bg-[#0EA5E9]/10 shadow-sm font-semibold h-[42px]" onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel';
            input.onchange = async (e) => {
              if (!e.target.files?.length) return;
              toast.loading('Parsing file...', { id: 'import' });
              try {
                const data = await parseExcel(e.target.files[0]);
                const validated = validateRows(data);
                const errors = validated.filter(r => r.status === 'error').length;
                if (errors > 0) {
                  toast.error(`Found ${errors} rows with errors. Please check data format.`, { id: 'import' });
                } else {
                  toast.success(`Successfully imported ${validated.length} items!`, { id: 'import' });
                  fetchMedicines();
                }
              } catch (err) {
                toast.error('Failed to parse file', { id: 'import' });
              }
            };
            input.click();
          }}>
            <Download size={18} className="mr-1" /> Import CSV
          </Button>
          <Button variant="secondary" onClick={handleSimulatedScan} className="h-[42px] font-semibold bg-white dark:bg-surface-800 border-[#E2E8F0] dark:border-surface-700 hover:border-[#0EA5E9] transition-colors group">
            <ScanLine size={18} className="text-[#64748B] group-hover:text-[#0EA5E9]" /> 
            <span className="hidden sm:inline">Scan</span>
          </Button>
          <Button onClick={() => { setEditingMed(null); setFormData({name:'', generic_name:'', batch_no:'', category:'Tablet', quantity:0, min_stock_level:10, cost_price:'', selling_price:'', mrp:'', expiry_date:''}); setShowForm(true); }} className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white shadow-md shadow-[#0EA5E9]/20 font-bold h-[42px] px-5 transition-transform hover:scale-[1.02]">
            <Plus size={18} /> <span className="hidden sm:inline">Add Medicine</span>
          </Button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 bg-white dark:bg-surface-800 border-[#E2E8F0] dark:border-surface-700 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#0EA5E9]/10 flex items-center justify-center text-[#0EA5E9]"><Package size={24} /></div>
          <div>
            <p className="text-sm font-semibold font-heading text-[#64748B]">Total Items</p>
            <p className="text-2xl font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{total}</p>
          </div>
        </div>
        <div className="card p-5 bg-white dark:bg-surface-800 border-[#E2E8F0] dark:border-surface-700 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#F97316]/10 flex items-center justify-center text-[#F97316]"><AlertTriangle size={24} /></div>
          <div>
            <p className="text-sm font-semibold font-heading text-[#64748B]">Low Stock Alerts</p>
            <p className="text-2xl font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{medicines.filter(m => m.is_low_stock).length}</p>
          </div>
        </div>
        <div className="card p-5 bg-white dark:bg-surface-800 border-[#E2E8F0] dark:border-surface-700 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E]"><DollarSign size={24} /></div>
          <div>
            <p className="text-sm font-semibold font-heading text-[#64748B]">Est. Stock Value</p>
            <p className="text-2xl font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{formatCurrency(medicines.reduce((s, m) => s + (m.quantity * parseFloat(m.cost_price || 0)), 0))}</p>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="card overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[#E2E8F0] dark:border-surface-700 bg-[#F8FAFC] dark:bg-surface-800/50 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search medicines by name or batch..." className="input-field pl-9" />
          </div>
          <select value={category} onChange={e => setCategory(e.target.value)} className="input-field w-auto min-w-[160px] cursor-pointer bg-white">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loading ? <TableSkeleton rows={7} /> : medicines.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-surface-100 dark:bg-surface-800 rounded-full flex items-center justify-center mb-4 text-[#0EA5E9]">
              <PackageOpen size={32} />
            </div>
            <h3 className="text-lg font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] mb-1">No medicines found</h3>
            <p className="text-[#64748B] mb-6">Your inventory matches no records. Try adjusting filters.</p>
            <Button onClick={() => setShowForm(true)}><Plus size={16} /> Add First Item</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="table-header">
                  <th className="px-6 py-4 font-semibold">Medicine Name</th>
                  <th className="px-6 py-4 font-semibold">Category & Batch</th>
                  <th className="px-6 py-4 font-semibold text-right">Stock Level</th>
                  <th className="px-6 py-4 font-semibold text-right">Pricing</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-surface-700 text-sm">
                <AnimatePresence initial={false}>
                  {medicines.map(med => (
                    <motion.tr 
                      key={med.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', backgroundColor: recentlyAddedId === med.id ? '#f0fdfa' : 'transparent' }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.2 }}
                      className="table-row group"
                    >
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{med.name}</p>
                        <p className="text-[12px] text-[#94A3B8] mt-0.5">{med.generic_name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[#475569] dark:text-surface-300 font-medium">{med.category}</p>
                        <p className="text-[12px] text-[#94A3B8] font-mono mt-0.5">{med.batch_no}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className={`font-semibold ${med.is_low_stock ? 'text-[#F97316]' : 'text-[#0F172A] dark:text-[#F1F5F9]'}`}>
                          {med.quantity} <span className="text-[12px] font-normal text-[#94A3B8]">{med.unit}</span>
                        </p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{formatCurrency(med.selling_price)}</p>
                        <p className="text-[12px] text-[#94A3B8] mt-0.5">Cost: {formatCurrency(med.cost_price)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <ExpiryBadge status={med.expiry_status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingMed(med); setFormData(med); setShowForm(true); }} className="p-2 text-[#64748B] hover:text-[#0EA5E9] hover:bg-sky-50 dark:hover:bg-surface-800 rounded-md transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => { if(window.confirm('Are you sure you want to delete this item?')) toast.success('Medicine deleted successfully'); }} className="p-2 text-[#64748B] hover:text-[#EF4444] hover:bg-red-50 dark:hover:bg-surface-800 rounded-md transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
        
        {total > 20 && !isDemo && (
          <div className="px-6 py-4 border-t border-[#E2E8F0] dark:border-surface-700 flex items-center justify-between text-sm bg-white dark:bg-surface-800">
            <span className="text-[#64748B]">Showing <span className="font-semibold text-[#0F172A] dark:text-white">{medicines.length}</span> of <span className="font-semibold text-[#0F172A] dark:text-white">{total}</span></span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft size={16} className="mr-1"/> Prev</Button>
              <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)}>Next <ChevronRight size={16} className="ml-1"/></Button>
            </div>
          </div>
        )}
      </motion.div>

      <SlideOver isOpen={showForm} onClose={() => setShowForm(false)} title={editingMed ? 'Edit Medicine' : 'Add New Medicine'}>
        <div className="flex justify-between items-center bg-[#F0F9FF] dark:bg-sky-900/20 p-3 rounded-lg border border-[#0EA5E9]/20 mb-6 mt-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#0EA5E9]/10 flex items-center justify-center text-[#0EA5E9]">
              <ScanLine size={16} />
            </div>
            <div>
              <p className="text-sm font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9]">Have a Barcode or QR?</p>
              <p className="text-[11px] text-[#64748B]">Scan the packaging to auto-fill details.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSimulatedScan} className="bg-white">Scan Now</Button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col h-full">
          <div className="flex-1 space-y-8 pb-10">
            {/* Identification Group */}
            <section>
              <h4 className="text-[12px] font-bold text-[#0EA5E9] uppercase tracking-wider mb-4 font-heading border-b border-[#E2E8F0] dark:border-surface-700 pb-2">Identification</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="form-label">Brand Name *</label><input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required className="input-field" placeholder="e.g. Dolo 650" /></div>
                <div className="col-span-2"><label className="form-label">Generic Name</label><input value={formData.generic_name} onChange={e => setFormData({ ...formData, generic_name: e.target.value })} className="input-field" placeholder="e.g. Paracetamol" /></div>
                <div className="col-span-2"><label className="form-label">Category</label>
                  <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="input-field bg-white">
                    {CATEGORIES.filter(c => c !== 'All Categories').map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* Pricing Group */}
            <section>
              <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-surface-700 pb-2 mb-4">
                <h4 className="text-[12px] font-bold text-[#0EA5E9] uppercase tracking-wider font-heading">Pricing & Margins</h4>
                {margin > 0 && <span className="text-xs font-bold text-[#22C55E] bg-emerald-50 px-2 py-0.5 rounded">{margin}% Margin</span>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Cost Price (₹) *</label><input type="number" step="0.01" value={formData.cost_price} onChange={e => setFormData({ ...formData, cost_price: e.target.value })} required className="input-field" /></div>
                <div><label className="form-label">Selling Price (₹) *</label><input type="number" step="0.01" value={formData.selling_price} onChange={e => setFormData({ ...formData, selling_price: e.target.value })} required className="input-field" /></div>
                <div className="col-span-2"><label className="form-label">MRP (₹)</label><input type="number" step="0.01" value={formData.mrp} onChange={e => setFormData({ ...formData, mrp: e.target.value })} className="input-field" /></div>
              </div>
            </section>

            {/* Logistics Group */}
            <section>
              <h4 className="text-[12px] font-bold text-[#0EA5E9] uppercase tracking-wider mb-4 font-heading border-b border-[#E2E8F0] dark:border-surface-700 pb-2">Stock & Tracking</h4>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Batch No *</label><input value={formData.batch_no} onChange={e => setFormData({ ...formData, batch_no: e.target.value })} required className="input-field font-mono" /></div>
                <div><label className="form-label">Expiry Date *</label><input type="date" value={formData.expiry_date} onChange={e => setFormData({ ...formData, expiry_date: e.target.value })} required className="input-field" /></div>
                <div><label className="form-label">Current Stock *</label><input type="number" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} required className="input-field" /></div>
                <div><label className="form-label">Min Alert Level</label><input type="number" value={formData.min_stock_level} onChange={e => setFormData({ ...formData, min_stock_level: e.target.value })} className="input-field" /></div>
              </div>
            </section>
          </div>

          <div className="pt-5 border-t border-[#E2E8F0] dark:border-surface-700 mt-auto flex gap-3 bg-white dark:bg-surface-800 -mx-6 px-6 -mb-6 pb-6 pt-4 sticky bottom-0">
            <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
            <Button type="submit" loading={saving} className="flex-1">{editingMed ? 'Save Changes' : 'Add Medicine'}</Button>
          </div>
        </form>
      </SlideOver>

      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="card w-full max-w-sm bg-white dark:bg-surface-800 p-6 flex flex-col items-center text-center relative overflow-hidden">
              <h3 className="text-lg font-bold font-heading text-[#0F172A] dark:text-white mb-6">Scanning QR Code...</h3>
              
              <div className="relative w-48 h-48 mb-6">
                <div className="absolute inset-0 border-2 border-[#E2E8F0] dark:border-surface-600 rounded-2xl" />
                
                {/* Scanner Frame corners */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#0EA5E9] rounded-tl-2xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#0EA5E9] rounded-tr-2xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#0EA5E9] rounded-bl-2xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#0EA5E9] rounded-br-2xl" />
                
                {/* Scanning Laser */}
                <motion.div 
                  animate={{ y: [0, 180, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="absolute left-4 right-4 h-0.5 bg-[#0EA5E9] shadow-[0_0_8px_2px_rgba(14,165,233,0.5)]"
                />
                
                {/* Mock QR Content inside */}
                <div className="absolute inset-4 opacity-10 dark:invert">
                  <svg viewBox="0 0 100 100" fill="currentColor">
                    <rect x="10" y="10" width="30" height="30" />
                    <rect x="60" y="10" width="30" height="30" />
                    <rect x="10" y="60" width="30" height="30" />
                    <rect x="50" y="50" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="10" />
                  </svg>
                </div>
              </div>
              
              <p className="text-sm text-[#64748B] mb-6">Position the barcode or QR code within the frame.</p>
              
              <Button variant="outline" className="w-full" onClick={() => setShowScanner(false)}>Cancel Scan</Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
