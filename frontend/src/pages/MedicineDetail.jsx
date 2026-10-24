import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { medicineAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { getExpiryStatus, getExpiryLabel } from '../utils/expiryUtils';
import { ExpiryBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { QRCodeDisplay, InlineQRCode } from '../components/scanner/QRCodeDisplay';
import { CardSkeleton } from '../components/ui/Skeleton';
import { motion } from 'framer-motion';
import { ArrowLeft, Edit2, QrCode, Package, DollarSign, Calendar, AlertTriangle, TrendingUp, Hash, Building2, Pill, BarChart3, ClipboardList, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import { safeGetJSON } from '../utils/storage';

const DEMO_MEDICINE = {
  id: '1', name: 'Dolo 650', generic_name: 'Paracetamol', manufacturer: 'Micro Labs',
  batch_no: 'DL2309', category: 'Tablet', quantity: 345, min_stock_level: 50,
  unit: 'strips', cost_price: 22.50, selling_price: 30.00, mrp: 33.00,
  expiry_date: '2027-06-15', barcode: '8901234567890', hsn_code: '30049099',
  expiry_status: 'healthy', is_low_stock: false, created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-10-20T14:00:00Z',
  supplier: { name: 'Sun Pharma Distributors', phone: '9876543210' },
};

export default function MedicineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [medicine, setMedicine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const isDemo = safeGetJSON('spms_demo', false);
        if (isDemo) {
          setMedicine(DEMO_MEDICINE);
        } else {
          const res = await medicineAPI.get(id);
          setMedicine(res.data);
        }
      } catch {
        setMedicine(DEMO_MEDICINE);
        toast.success('Showing preview data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1000px] mx-auto">
        <CardSkeleton />
        <div className="grid grid-cols-2 gap-6"><CardSkeleton /><CardSkeleton /></div>
      </div>
    );
  }

  if (!medicine) {
    return (
      <div className="text-center py-20">
        <h3 className="text-lg font-bold text-[#0F172A] dark:text-white mb-2">Medicine not found</h3>
        <Button onClick={() => navigate('/inventory')}>← Back to Inventory</Button>
      </div>
    );
  }

  const margin = medicine.cost_price && medicine.selling_price
    ? (((medicine.selling_price - medicine.cost_price) / medicine.selling_price) * 100).toFixed(1)
    : 0;

  const stockPercentage = medicine.min_stock_level > 0
    ? Math.min(100, (medicine.quantity / (medicine.min_stock_level * 3)) * 100)
    : 100;

  const qrData = {
    type: 'PharmaTrack-Medicine',
    id: medicine.id,
    name: medicine.name,
    generic: medicine.generic_name,
    batch: medicine.batch_no,
    expiry: medicine.expiry_date,
    price: medicine.selling_price,
    barcode: medicine.barcode,
  };

  return (
    <div className="space-y-6 pb-10 max-w-[1000px] mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <button onClick={() => navigate('/inventory')} className="flex items-center gap-1.5 text-sm font-semibold text-[#0EA5E9] hover:text-[#0284C7] mb-3 transition-colors">
            <ArrowLeft size={16} /> Back to Inventory
          </button>
          <h1 className="text-[28px] font-bold text-[#0F172A] dark:text-[#F1F5F9] font-heading tracking-tight">{medicine.name}</h1>
          {medicine.generic_name && <p className="text-[#64748B] mt-0.5 font-medium">{medicine.generic_name}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowQR(true)} className="gap-2">
            <QrCode size={16} /> QR Code
          </Button>
          <Button onClick={() => navigate(`/inventory`)} className="gap-2">
            <Edit2 size={16} /> Edit
          </Button>
        </div>
      </motion.div>

      {/* Main Info + QR */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="p-5 border-b border-[#E2E8F0] dark:border-surface-700 bg-[#F8FAFC] dark:bg-surface-800/50">
            <h3 className="text-sm font-bold font-heading text-[#0F172A] dark:text-white uppercase tracking-wider">Medicine Details</h3>
          </div>
          <div className="p-5 grid grid-cols-2 gap-y-5 gap-x-8">
            <InfoRow icon={Pill} label="Category" value={medicine.category} />
            <InfoRow icon={Hash} label="Batch Number" value={medicine.batch_no} mono />
            <InfoRow icon={Building2} label="Manufacturer" value={medicine.manufacturer || '—'} />
            <InfoRow icon={Package} label="Unit" value={medicine.unit || 'strips'} />
            <InfoRow icon={Calendar} label="Expiry Date" value={medicine.expiry_date ? formatDate(medicine.expiry_date) : '—'} />
            <InfoRow icon={ClipboardList} label="HSN Code" value={medicine.hsn_code || '—'} mono />
            <InfoRow icon={BarChart3} label="Barcode" value={medicine.barcode || '—'} mono />
            <InfoRow icon={Calendar} label="Last Updated" value={medicine.updated_at ? new Date(medicine.updated_at).toLocaleDateString('en-IN') : '—'} />
          </div>
        </div>

        {/* Right: QR Preview + Status */}
        <div className="space-y-6">
          {/* QR Preview Card */}
          <div className="card p-5 flex flex-col items-center">
            <p className="text-xs font-bold text-[#0EA5E9] uppercase tracking-wider mb-3">Shelf Label QR</p>
            <div className="bg-white p-3 rounded-xl shadow-sm border border-[#E2E8F0]">
              <InlineQRCode data={qrData} size={140} />
            </div>
            <p className="text-[11px] text-surface-400 mt-2 text-center">Scan to view medicine info</p>
            <Button variant="outline" size="sm" onClick={() => setShowQR(true)} className="mt-3 w-full">
              Download / Print
            </Button>
          </div>

          {/* Expiry Status */}
          <div className="card p-5">
            <p className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">Status</p>
            <div className="flex items-center gap-3 mb-3">
              <ExpiryBadge status={medicine.expiry_status} />
            </div>
            {medicine.is_low_stock && (
              <div className="flex items-center gap-2 text-[#F97316] text-sm font-bold mt-2">
                <AlertTriangle size={16} /> Low Stock Alert
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Financial Info */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign} label="Cost Price" value={formatCurrency(medicine.cost_price)} color="#64748B" />
        <MetricCard icon={DollarSign} label="Selling Price" value={formatCurrency(medicine.selling_price)} color="#0EA5E9" />
        <MetricCard icon={DollarSign} label="MRP" value={formatCurrency(medicine.mrp || medicine.selling_price)} color="#6366F1" />
        <MetricCard icon={TrendingUp} label="Margin" value={`${margin}%`} color="#22C55E" />
      </motion.div>

      {/* Stock Level */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold font-heading text-[#0F172A] dark:text-white uppercase tracking-wider">Stock Level</h3>
          <span className="text-2xl font-bold font-sans text-[#0F172A] dark:text-white">
            {medicine.quantity} <span className="text-sm font-normal text-surface-400">{medicine.unit}</span>
          </span>
        </div>
        <div className="relative h-4 bg-[#F1F5F9] dark:bg-surface-900 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${stockPercentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              medicine.is_low_stock ? 'bg-gradient-to-r from-[#F97316] to-[#EF4444]' :
              stockPercentage > 60 ? 'bg-gradient-to-r from-[#22C55E] to-[#10B981]' :
              'bg-gradient-to-r from-[#F59E0B] to-[#F97316]'
            }`}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs font-semibold text-surface-400">
          <span>Min: {medicine.min_stock_level} {medicine.unit}</span>
          <span>Current: {medicine.quantity} {medicine.unit}</span>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/billing')}
          className="card p-5 flex items-center gap-4 hover:border-[#0EA5E9] hover:shadow-md transition-all group text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-[#0EA5E9]/10 flex items-center justify-center text-[#0EA5E9] group-hover:scale-110 transition-transform">
            <ShoppingCart size={22} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#0F172A] dark:text-white">Quick Sale</p>
            <p className="text-xs text-surface-400">Add to billing cart</p>
          </div>
        </button>

        <button
          onClick={() => setShowQR(true)}
          className="card p-5 flex items-center gap-4 hover:border-[#6366F1] hover:shadow-md transition-all group text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-[#6366F1]/10 flex items-center justify-center text-[#6366F1] group-hover:scale-110 transition-transform">
            <QrCode size={22} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#0F172A] dark:text-white">Print Label</p>
            <p className="text-xs text-surface-400">Generate QR shelf label</p>
          </div>
        </button>

        <button
          onClick={() => toast.success('Reorder feature coming soon!')}
          className="card p-5 flex items-center gap-4 hover:border-[#22C55E] hover:shadow-md transition-all group text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] group-hover:scale-110 transition-transform">
            <Package size={22} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#0F172A] dark:text-white">Reorder</p>
            <p className="text-xs text-surface-400">Send order to supplier</p>
          </div>
        </button>
      </motion.div>

      {/* QR Modal */}
      <QRCodeDisplay
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        data={qrData}
        title={medicine.name}
        subtitle={`Batch: ${medicine.batch_no} • ${medicine.category}`}
        filename={`${medicine.name}_${medicine.batch_no}`}
      />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-md bg-[#F1F5F9] dark:bg-surface-800 flex items-center justify-center text-surface-400 mt-0.5 flex-shrink-0">
        <Icon size={15} />
      </div>
      <div>
        <p className="text-[11px] font-bold text-surface-400 uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15`, color }}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-[11px] font-bold text-surface-400 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold font-sans text-[#0F172A] dark:text-white">{value}</p>
      </div>
    </div>
  );
}
