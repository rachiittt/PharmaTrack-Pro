import { useState, useEffect, useRef } from 'react';
import { medicineAPI, salesAPI, customerAPI } from '../services/api';
import { useCart } from '../context/CartContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { generateInvoiceNo } from '../utils/invoiceUtils';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Search, Plus, Minus, Trash2, Printer, X, User, ShoppingBag, CheckCircle, ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { safeGetJSON } from '../utils/storage';

const DEMO_MEDICINES = [
  { id: '1', name: 'Dolo 650', category: 'Tablet', quantity: 345, selling_price: 30.00, expiry_status: 'healthy', batch_no: 'DL2309' },
  { id: '2', name: 'Azithral 500', category: 'Tablet', quantity: 120, selling_price: 135.00, expiry_status: 'healthy', batch_no: 'AZ5511' },
  { id: '3', name: 'Pantocid 40', category: 'Tablet', quantity: 15, selling_price: 160.00, expiry_status: 'healthy', batch_no: 'PT4002' },
  { id: '4', name: 'Corex DX', category: 'Syrup', quantity: 45, selling_price: 115.00, expiry_status: 'warning', batch_no: 'CX8890' },
];

const DEMO_CUSTOMERS = [
  { id: 'c1', name: 'Amit Patel', phone: '9876543210', loyalty_points: 120 },
  { id: 'c2', name: 'Sunita Sharma', phone: '8765432109', loyalty_points: 45 },
];

export default function Billing() {
  const { items, customer, discount, gstRate, paymentMethod, subtotal, discountAmount, taxAmount, total, dispatch } = useCart();
  const [medicines, setMedicines] = useState([]);
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [custSearch, setCustSearch] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => { searchRef.current?.focus(); setIsDemo(safeGetJSON('spms_demo', false)); }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!search) { setMedicines([]); return; }
      if (isDemo) { setMedicines(DEMO_MEDICINES.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.batch_no.toLowerCase().includes(search.toLowerCase()))); return; }
      try { 
        const res = await medicineAPI.list({ search, limit: 15 }); 
        setMedicines((res.data?.data || []).filter(m => m.expiry_status !== 'expired' && m.quantity > 0)); 
      } catch {
        console.warn('Backend unavailable, falling back to rich demo data.');
        setMedicines(DEMO_MEDICINES.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.batch_no.toLowerCase().includes(search.toLowerCase())));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, isDemo]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!custSearch) { setCustomers([]); return; }
      if (isDemo) { setCustomers(DEMO_CUSTOMERS.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()) || c.phone.includes(custSearch))); return; }
      try { 
        const res = await customerAPI.list({ search: custSearch, limit: 5 }); 
        setCustomers(res.data?.data || []); 
      } catch {
        console.warn('Backend unavailable, falling back to rich demo data.');
        setCustomers(DEMO_CUSTOMERS.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()) || c.phone.includes(custSearch)));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [custSearch, isDemo]);

  const addToCart = (med) => {
    dispatch({ type: 'ADD_ITEM', payload: { medicine_id: med.id, name: med.name, unit_price: parseFloat(med.selling_price), max_qty: med.quantity, expiry_status: med.expiry_status } });
    setSearch('');
    searchRef.current?.focus();
  };

  const handleBill = async () => {
    if (items.length === 0) return toast.error('Cart is empty');
    setProcessing(true);

    if (isDemo) {
      setTimeout(() => {
        setLastSale({ invoice_no: generateInvoiceNo(), subtotal, taxAmount, total, discount, paymentMethod, items, customer, created_at: new Date().toISOString() });
        setShowReceipt(true);
        dispatch({ type: 'CLEAR' });
        toast.success('Sale completed');
        setProcessing(false);
      }, 500);
      return;
    }
    setProcessing(false);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)] max-w-[1600px] mx-auto">
      {/* Left: Search & Results */}
      <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="lg:w-7/12 xl:w-2/3 flex flex-col h-full card overflow-hidden">
        <div className="p-5 border-b border-[#E2E8F0] dark:border-surface-700 bg-[#F8FAFC] dark:bg-surface-800/50">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0EA5E9]" />
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Scan barcode or type medicine name..."
              className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-surface-800 border-2 border-[#E2E8F0] dark:border-surface-600 rounded-xl text-base font-sans font-medium focus:border-[#0EA5E9] focus:outline-none focus:ring-4 focus:ring-[#0EA5E9]/10 transition-all shadow-sm" autoFocus />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-surface-50 dark:bg-surface-900/50">
          {search ? (
            <div className="divide-y divide-[#E2E8F0] dark:divide-surface-700 p-2">
              <AnimatePresence>
                {medicines.map((med) => (
                  <motion.button key={med.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => addToCart(med)} className="w-full flex items-center justify-between p-4 hover:bg-white dark:hover:bg-surface-800 text-left transition-colors rounded-lg mb-1 group shadow-sm border border-transparent hover:border-[#E2E8F0] dark:hover:border-surface-600">
                    <div>
                      <p className="text-[15px] font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{med.name}</p>
                      <p className="text-xs text-[#64748B] mt-1 font-medium">Batch: <span className="font-mono">{med.batch_no}</span> • <span className="text-[#0EA5E9]">{med.quantity} in stock</span></p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{formatCurrency(med.selling_price)}</span>
                      <div className="text-xs text-[#0EA5E9] font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1"><Plus size={12}/> Add to Bill</div>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
              {medicines.length === 0 && (
                <div className="p-16 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-[#F1F5F9] dark:bg-surface-800 rounded-full flex items-center justify-center mb-4 text-[#94A3B8]"><Search size={32} /></div>
                  <p className="text-lg font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] mb-1">No medicines found</p>
                  <p className="text-[#64748B]">Try a different search term or scan again.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-20 h-20 bg-[#F0F9FF] dark:bg-sky-900/20 rounded-full flex items-center justify-center mb-6 text-[#0EA5E9]">
                <ShoppingBag size={40} />
              </div>
              <h3 className="text-xl font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9] mb-2">Ready for next customer</h3>
              <p className="text-[#64748B] max-w-sm">Scan a barcode or search for a medicine name above to start building the cart.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Right: Cart */}
      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="lg:w-5/12 xl:w-1/3 flex flex-col h-full card overflow-hidden border-t-4 border-t-[#1E3A5F]">
        {/* Customer Select */}
        <div className="p-4 border-b border-[#E2E8F0] dark:border-surface-700 bg-white dark:bg-surface-800 z-20">
          {!customer ? (
            <div className="relative">
              <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Add customer (optional)..."
                className="input-field pl-9" />
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              
              <AnimatePresence>
                {custSearch && customers.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-full left-0 right-0 bg-white dark:bg-surface-800 border border-[#E2E8F0] dark:border-surface-600 rounded-lg shadow-xl mt-2 overflow-hidden divide-y divide-[#E2E8F0] dark:divide-surface-700">
                    {customers.map(c => (
                      <button key={c.id} onClick={() => { dispatch({ type: 'SET_CUSTOMER', payload: c }); setCustSearch(''); setCustomers([]); }} className="w-full text-left p-3 hover:bg-[#F8FAFC] dark:hover:bg-surface-700 transition-colors">
                        <span className="block text-sm font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{c.name}</span>
                        <span className="block text-xs text-[#64748B]">{c.phone}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-[#F8FAFC] dark:bg-surface-900 border border-[#E2E8F0] dark:border-surface-700 px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-[#1E3A5F] rounded-md flex items-center justify-center text-white text-[10px] font-bold"><User size={12}/></div>
                <span className="text-sm font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{customer.name}</span>
              </div>
              <button onClick={() => dispatch({ type: 'SET_CUSTOMER', payload: null })} className="p-1.5 hover:bg-white dark:hover:bg-surface-800 rounded-md text-[#EF4444] shadow-sm"><X size={14} /></button>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-surface-800 p-2">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
              <ShoppingCart size={32} className="text-[#94A3B8] mb-3" />
              <p className="font-semibold text-[#475569]">Cart is empty</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {items.map(item => (
                  <motion.div key={item.medicine_id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex justify-between items-center group p-3 hover:bg-[#F8FAFC] dark:hover:bg-surface-900/50 rounded-lg border border-transparent hover:border-[#E2E8F0] dark:hover:border-surface-700 transition-all">
                    <div className="flex-1 pr-4">
                      <p className="text-[14px] font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9] line-clamp-1">{item.name}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1 bg-white dark:bg-surface-800 rounded-md p-0.5 border border-[#E2E8F0] dark:border-surface-600 shadow-sm">
                          <button onClick={() => dispatch({ type: 'UPDATE_QTY', payload: { id: item.medicine_id, qty: item.quantity - 1 } })} className="w-6 h-6 flex items-center justify-center hover:bg-[#F1F5F9] dark:hover:bg-surface-700 rounded text-[#475569] transition-colors"><Minus size={12} /></button>
                          <span className="w-8 text-center text-[13px] font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{item.quantity}</span>
                          <button onClick={() => dispatch({ type: 'UPDATE_QTY', payload: { id: item.medicine_id, qty: Math.min(item.quantity + 1, item.max_qty) } })} className="w-6 h-6 flex items-center justify-center hover:bg-[#F1F5F9] dark:hover:bg-surface-700 rounded text-[#475569] transition-colors"><Plus size={12} /></button>
                        </div>
                        <span className="text-xs font-semibold text-[#64748B]">× {formatCurrency(item.unit_price)}</span>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <span className="text-[15px] font-bold font-sans text-[#0F172A] dark:text-[#F1F5F9]">{formatCurrency(item.unit_price * item.quantity)}</span>
                      <button onClick={() => dispatch({ type: 'REMOVE_ITEM', payload: item.medicine_id })} className="p-1.5 text-[#94A3B8] hover:text-[#EF4444] hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all rounded-md"><Trash2 size={14} /></button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 bg-[#F8FAFC] dark:bg-surface-900 border-t border-[#E2E8F0] dark:border-surface-700">
          <div className="flex gap-3 mb-4">
            <div className="relative w-24">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#64748B]">Disc%</span>
              <input type="number" placeholder="0" value={discount || ''} onChange={e => dispatch({ type: 'SET_DISCOUNT', payload: parseFloat(e.target.value) || 0 })} className="input-field pl-12 h-9 text-right font-bold" />
            </div>
            <select value={gstRate} onChange={e => dispatch({ type: 'SET_GST', payload: parseFloat(e.target.value) })} className="input-field flex-1 h-9 font-semibold">
              <option value="0">GST: 0%</option><option value="5">GST: 5%</option><option value="12">GST: 12%</option><option value="18">GST: 18%</option>
            </select>
          </div>

          <div className="space-y-2 mb-5 text-[14px] font-sans">
            <div className="flex justify-between text-[#475569] font-medium"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-[#22C55E] font-semibold"><span>Discount ({discount}%)</span><span>-{formatCurrency(discountAmount)}</span></div>}
            {gstRate > 0 && <div className="flex justify-between text-[#475569] font-medium"><span>Tax ({gstRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>}
            <div className="flex justify-between font-bold text-lg text-[#0F172A] dark:text-[#F1F5F9] pt-3 mt-2 border-t border-[#E2E8F0] dark:border-surface-700"><span>Total</span><span>{formatCurrency(total)}</span></div>
          </div>

          <div className="flex gap-2 mb-5 bg-[#E2E8F0]/50 dark:bg-surface-800 p-1 rounded-lg">
            {['cash', 'upi', 'card'].map(m => (
              <button key={m} onClick={() => dispatch({ type: 'SET_PAYMENT', payload: m })} className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${paymentMethod === m ? 'bg-white dark:bg-surface-700 shadow-sm text-[#0EA5E9]' : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'}`}>{m}</button>
            ))}
          </div>

          <Button onClick={handleBill} disabled={items.length === 0 || processing} loading={processing} className="w-full h-12 text-base">Complete Sale →</Button>
        </div>
      </motion.div>

      <Modal isOpen={showReceipt} onClose={() => setShowReceipt(false)} size="sm">
        {lastSale && (
          <div className="space-y-6">
            <div className="text-center pb-6 border-b border-dashed border-[#CBD5E1] dark:border-surface-600">
              <div className="w-16 h-16 bg-[#F0F9FF] rounded-full flex items-center justify-center mx-auto mb-4 text-[#0EA5E9]"><CheckCircle size={32} /></div>
              <h2 className="text-2xl font-bold font-heading text-[#0F172A] dark:text-white">Payment Successful</h2>
              <p className="text-sm font-medium text-[#64748B] mt-1">Invoice #{lastSale.invoice_no}</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setShowReceipt(false)} className="flex-1" variant="outline">Done</Button>
              <Button onClick={() => window.print()} className="flex-1"><Printer size={16} className="mr-2" /> Print Bill</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Hidden Printable Receipt */}
      {lastSale && (
        <div className="hidden print-only print:block p-8 bg-white text-black font-mono">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase">Smart Pharmacy</h1>
            <p className="text-sm">123 Health Street, Medical District</p>
            <p className="text-sm">Tel: +91 98765 43210</p>
          </div>
          
          <div className="border-b border-dashed border-gray-400 pb-4 mb-4 text-sm">
            <p>Invoice No: {lastSale.invoice_no}</p>
            <p>Date: {new Date(lastSale.created_at).toLocaleString()}</p>
            <p>Payment: {lastSale.paymentMethod?.toUpperCase()}</p>
            {lastSale.customer && <p>Customer: {lastSale.customer.name}</p>}
          </div>

          <table className="w-full text-left mb-4 text-sm">
            <thead>
              <tr className="border-b border-dashed border-gray-400">
                <th className="py-2 font-normal">Item</th>
                <th className="py-2 font-normal">Qty</th>
                <th className="py-2 font-normal">Rate</th>
                <th className="py-2 font-normal text-right">Amt</th>
              </tr>
            </thead>
            <tbody>
              {lastSale.items.map(item => (
                <tr key={item.medicine_id}>
                  <td className="py-1 pr-2">{item.name}</td>
                  <td className="py-1">{item.quantity}</td>
                  <td className="py-1">{item.unit_price.toFixed(2)}</td>
                  <td className="py-1 text-right">{(item.quantity * item.unit_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-gray-400 pt-4 mb-8 text-sm">
            <div className="flex justify-between"><p>Subtotal</p><p>{lastSale.subtotal.toFixed(2)}</p></div>
            {lastSale.discount > 0 && <div className="flex justify-between"><p>Discount ({lastSale.discount}%)</p><p>-{((lastSale.subtotal * lastSale.discount) / 100).toFixed(2)}</p></div>}
            {lastSale.taxAmount > 0 && <div className="flex justify-between"><p>Tax</p><p>{lastSale.taxAmount.toFixed(2)}</p></div>}
            <div className="flex justify-between font-bold mt-2 text-lg"><p>TOTAL</p><p>₹{lastSale.total.toFixed(2)}</p></div>
          </div>

          <div className="text-center text-sm">
            <p>Thank you for your visit!</p>
            <p>Get well soon.</p>
          </div>
        </div>
      )}
    </div>
  );
}
