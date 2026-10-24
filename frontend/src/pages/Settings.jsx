import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { User, Store, BellRing, Shield, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);

  const TABS = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'store', label: 'Store Details', icon: Store },
    { id: 'notifications', label: 'Alert Preferences', icon: BellRing },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  const handleSave = (e) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      toast.success('Settings saved successfully');
      setSaving(false);
    }, 600);
  };

  return (
    <div className="space-y-6 pb-10 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A] dark:text-[#F1F5F9] font-heading tracking-tight">
            Settings & Preferences
          </h1>
          <div className="breadcrumb mt-1">
            <span className="text-[#64748B]">Dashboard</span> <span className="mx-2">/</span> <span className="text-[#0F172A] dark:text-[#F1F5F9]">Settings</span>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Tabs */}
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="w-full md:w-64 flex-shrink-0">
          <div className="card p-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                  activeTab === tab.id 
                    ? 'bg-[#0EA5E9]/10 text-[#0EA5E9]' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] dark:hover:bg-surface-800 hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                <tab.icon size={18} /> {tab.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Content Area */}
        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'profile' && (
                <div className="card overflow-hidden">
                  <div className="p-6 border-b border-[#E2E8F0] dark:border-surface-700">
                    <h3 className="text-lg font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9]">Personal Information</h3>
                    <p className="text-sm text-[#64748B] mt-1">Update your account profile details and email.</p>
                  </div>
                  <form onSubmit={handleSave} className="p-6 space-y-6">
                    <div className="flex items-center gap-6 pb-6 border-b border-[#E2E8F0] dark:border-surface-700">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#0EA5E9] flex items-center justify-center text-white text-2xl font-bold shadow-md">
                        {user?.full_name?.charAt(0) || 'A'}
                      </div>
                      <div>
                        <Button variant="secondary" className="mb-2"><ImageIcon size={16} className="mr-2"/> Change Avatar</Button>
                        <p className="text-xs text-[#94A3B8]">JPG, GIF or PNG. 1MB max.</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div><label className="form-label">Full Name</label><input className="input-field" defaultValue={user?.full_name || 'Admin User'} /></div>
                      <div><label className="form-label">Email Address</label><input className="input-field" defaultValue={user?.email || 'admin@spms.com'} /></div>
                      <div><label className="form-label">Phone Number</label><input className="input-field" defaultValue="+91 98765 43210" /></div>
                      <div><label className="form-label">Role</label><input className="input-field bg-surface-50 text-[#94A3B8] cursor-not-allowed" defaultValue={user?.role || 'Administrator'} disabled /></div>
                    </div>
                    
                    <div className="pt-4 flex justify-end">
                      <Button type="submit" loading={saving}>Save Profile Changes</Button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'store' && (
                <div className="card overflow-hidden">
                  <div className="p-6 border-b border-[#E2E8F0] dark:border-surface-700">
                    <h3 className="text-lg font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9]">Store Configuration</h3>
                    <p className="text-sm text-[#64748B] mt-1">Details used on invoices and reports.</p>
                  </div>
                  <form onSubmit={handleSave} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2"><label className="form-label">Pharmacy Name</label><input className="input-field" defaultValue="City Health Pharmacy" /></div>
                      <div className="md:col-span-2"><label className="form-label">Address</label><textarea className="input-field h-24 resize-none" defaultValue="123 Health Ave, Medical District&#10;Mumbai, MH 400001" /></div>
                      <div><label className="form-label">GSTIN</label><input className="input-field font-mono uppercase" defaultValue="27AADCB2230M1Z2" /></div>
                      <div><label className="form-label">Drug License No.</label><input className="input-field font-mono uppercase" defaultValue="MH-MZ1-123456" /></div>
                    </div>
                    <div className="pt-4 flex justify-end">
                      <Button type="submit" loading={saving}>Save Store Details</Button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="card overflow-hidden">
                  <div className="p-6 border-b border-[#E2E8F0] dark:border-surface-700">
                    <h3 className="text-lg font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9]">Alert Preferences</h3>
                    <p className="text-sm text-[#64748B] mt-1">Configure when and how you receive alerts.</p>
                  </div>
                  <form onSubmit={handleSave} className="p-6 space-y-6">
                    <div className="space-y-4">
                      {[
                        { title: 'Low Stock Alerts', desc: 'Notify when items fall below minimum threshold' },
                        { title: 'Expiry Warnings', desc: 'Notify 30 days before items expire' },
                        { title: 'Daily Summary', desc: 'Email a summary of sales at end of day' }
                      ].map((pref, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-[#F8FAFC] dark:bg-surface-800/50 rounded-lg border border-[#E2E8F0] dark:border-surface-700">
                          <div>
                            <p className="font-bold text-[#0F172A] dark:text-[#F1F5F9]">{pref.title}</p>
                            <p className="text-sm text-[#64748B]">{pref.desc}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" defaultChecked />
                            <div className="w-11 h-6 bg-surface-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0EA5E9]"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                    <div className="pt-4 flex justify-end">
                      <Button type="submit" loading={saving}>Save Preferences</Button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="card overflow-hidden">
                  <div className="p-6 border-b border-[#E2E8F0] dark:border-surface-700">
                    <h3 className="text-lg font-bold font-heading text-[#0F172A] dark:text-[#F1F5F9]">Change Password</h3>
                  </div>
                  <form onSubmit={handleSave} className="p-6 space-y-6">
                    <div className="max-w-md space-y-4">
                      <div><label className="form-label">Current Password</label><input type="password" className="input-field" /></div>
                      <div><label className="form-label">New Password</label><input type="password" className="input-field" /></div>
                      <div><label className="form-label">Confirm New Password</label><input type="password" className="input-field" /></div>
                    </div>
                    <div className="pt-4 flex justify-start">
                      <Button type="submit" loading={saving}>Update Password</Button>
                    </div>
                  </form>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
