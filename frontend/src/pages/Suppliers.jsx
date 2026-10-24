import { useState, useEffect } from 'react';
import { supplierAPI } from '../services/api';
import { Button } from '../components/ui/Button';
import { SlideOver } from '../components/ui/Modal';
import { WhatsAppButton } from '../components/ui/WhatsAppButton';
import { TableSkeleton } from '../components/ui/Skeleton';
import { Plus, Edit2, Trash2, Truck, Phone, Mail, MapPin, Building2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { safeGetJSON } from '../utils/storage';

// DEMO DATA
const DEMO_SUPPLIERS = [
  { id: '1', name: 'Sun Pharma Distributors', contact_person: 'Vikram Mehta', phone: '9876543210', email: 'vikram@sunpharma.com', address: 'Andheri West, Mumbai', gst_number: '27AABCS1429B1ZX', whatsapp_number: '919876543210', medicines_count: 45 },
  { id: '2', name: 'Cipla Healthcare Ltd', contact_person: 'Priya Desai', phone: '8765432109', email: 'priya@cipla.com', address: 'Worli, Mumbai', gst_number: '27AABCC1234D1Z5', whatsapp_number: '918765432109', medicines_count: 32 },
  { id: '3', name: 'Abbott India Pvt Ltd', contact_person: 'Rahul Sharma', phone: '7654321098', email: 'rahul@abbott.in', address: 'MG Road, Bangalore', gst_number: '29AABCA5678E1Z3', whatsapp_number: '917654321098', medicines_count: 28 },
  { id: '4', name: 'Zydus Cadila', contact_person: 'Anita Patel', phone: '6543210987', email: 'anita@zyduscadila.com', address: 'SG Highway, Ahmedabad', gst_number: '24AABCZ9012F1Z1', whatsapp_number: '', medicines_count: 15 },
  { id: '5', name: 'Glenmark Pharma', contact_person: 'Suresh Kumar', phone: '9012345678', email: 'suresh@glenmark.com', address: 'Mahape, Navi Mumbai', gst_number: '27AABCG3456G1Z9', whatsapp_number: '919012345678', medicines_count: 22 },
];

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', gst_number: '', whatsapp_number: '' });
  const [saving, setSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const load = async () => {
    const demoMode = safeGetJSON('spms_demo', false);
    setIsDemo(demoMode);

    if (demoMode) {
      setTimeout(() => {
        setSuppliers(DEMO_SUPPLIERS);
        setLoading(false);
      }, 400);
      return;
    }

    try { const res = await supplierAPI.list(); setSuppliers(res.data || []); }
    catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filteredSuppliers = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.contact_person?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    if (isDemo) {
      setTimeout(() => { toast.success(editing ? 'Supplier updated (Demo)' : 'Supplier added (Demo)'); setShowForm(false); setEditing(null); setSaving(false); }, 600);
      return;
    }
    try {
      if (editing) { await supplierAPI.update(editing.id, form); toast.success('Supplier updated'); }
      else { await supplierAPI.create(form); toast.success('Supplier added'); }
      setShowForm(false); setEditing(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    if (isDemo) { toast.success('Supplier deleted (Demo)'); return; }
    try { await supplierAPI.delete(id); toast.success('Deleted'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Cannot delete'); }
  };

  const openEdit = (s) => { setForm({ name: s.name, contact_person: s.contact_person || '', phone: s.phone || '', email: s.email || '', address: s.address || '', gst_number: s.gst_number || '', whatsapp_number: s.whatsapp_number || '' }); setEditing(s); setShowForm(true); };
  const openNew = () => { setForm({ name: '', contact_person: '', phone: '', email: '', address: '', gst_number: '', whatsapp_number: '' }); setEditing(null); setShowForm(true); };

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/25">
              <Truck size={20} />
            </div>
            Suppliers
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">{suppliers.length} registered pharmaceutical suppliers</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers..."
              className="pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm w-56 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-slate-900 dark:text-white shadow-sm" />
          </div>
          <Button onClick={openNew} className="shadow-lg shadow-primary-500/20">
            <Plus size={18} className="mr-1" /> Add Supplier
          </Button>
        </div>
      </div>

      {/* Supplier Cards Grid */}
      {loading ? <TableSkeleton rows={5} cols={5} /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredSuppliers.map(s => (
            <div key={s.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-300 group relative overflow-hidden">
              {/* Decorative accent */}
              <div className="absolute top-0 right-0 w-20 h-20 bg-violet-50 dark:bg-violet-900/10 rounded-bl-[40px] -z-0 group-hover:scale-150 transition-transform duration-500" />
              
              <div className="relative z-10">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-violet-500/20 group-hover:scale-110 transition-transform">
                      {s.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">{s.name}</h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">{s.contact_person || 'No contact person'}</p>
                    </div>
                  </div>
                </div>

                {/* Info Lines */}
                <div className="space-y-2.5 mb-5">
                  {s.phone && (
                    <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                      <Phone size={14} className="text-slate-400 flex-shrink-0" /> {s.phone}
                    </div>
                  )}
                  {s.email && (
                    <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400 truncate">
                      <Mail size={14} className="text-slate-400 flex-shrink-0" /> {s.email}
                    </div>
                  )}
                  {s.address && (
                    <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400 truncate">
                      <MapPin size={14} className="text-slate-400 flex-shrink-0" /> {s.address}
                    </div>
                  )}
                </div>

                {/* Footer Stats + Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg text-xs font-bold border border-violet-100 dark:border-violet-800">
                      {s.medicines_count || 0} medicines
                    </span>
                    {s.gst_number && (
                      <span className="text-[10px] text-slate-400 font-mono tracking-wide hidden sm:block">GST: {s.gst_number.slice(0, 8)}...</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {s.whatsapp_number && <WhatsAppButton phone={s.whatsapp_number} message={`Hello ${s.name}, this is a message from PharmaTrack Pro.`} label="" size="sm" />}
                    <button onClick={() => openEdit(s)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors" title="Edit">
                      <Edit2 size={15} className="text-slate-500" />
                    </button>
                    <button onClick={() => handleDelete(s.id, s.name)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors" title="Delete">
                      <Trash2 size={15} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredSuppliers.length === 0 && (
            <div className="col-span-full bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-16 text-center">
              <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 dark:border-slate-700">
                <Truck size={32} className="text-slate-400" />
              </div>
              <p className="text-lg font-bold text-slate-800 dark:text-white mb-1">No suppliers found</p>
              <p className="text-sm text-slate-500 mb-6">Add your first pharmaceutical supplier to get started</p>
              <Button onClick={openNew} className="shadow-lg"><Plus size={18} className="mr-1" /> Add Supplier</Button>
            </div>
          )}
        </div>
      )}

      {/* Supplier Form Slide-Over */}
      <SlideOver isOpen={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Edit Supplier' : 'Add New Supplier'}>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Company Details</h3>
            {[
              { label: 'Company Name *', field: 'name', icon: Building2, required: true, placeholder: 'e.g. Sun Pharma Distributors' },
              { label: 'Contact Person', field: 'contact_person', icon: null, placeholder: 'e.g. Vikram Mehta' },
              { label: 'GST Number', field: 'gst_number', icon: null, placeholder: 'e.g. 27AABCS1429B1ZX' },
            ].map(({ label, field, required, placeholder }) => (
              <div key={field}>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
                <input value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} required={required} placeholder={placeholder}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none text-slate-900 dark:text-white shadow-sm" />
              </div>
            ))}
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Contact Information</h3>
            {[
              { label: 'Phone', field: 'phone', type: 'tel', placeholder: '9876543210' },
              { label: 'Email', field: 'email', type: 'email', placeholder: 'supplier@company.com' },
              { label: 'WhatsApp Number', field: 'whatsapp_number', type: 'tel', placeholder: '919876543210' },
              { label: 'Address', field: 'address', placeholder: 'Full address' },
            ].map(({ label, field, type, placeholder }) => (
              <div key={field}>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
                <input type={type || 'text'} value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} placeholder={placeholder}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none text-slate-900 dark:text-white shadow-sm" />
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={saving} className="flex-1 shadow-lg shadow-primary-500/20">{editing ? 'Update Supplier' : 'Save Supplier'}</Button>
            <Button variant="outline" type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="w-1/3">Cancel</Button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
