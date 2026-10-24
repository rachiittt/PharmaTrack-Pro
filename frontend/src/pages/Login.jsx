import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Activity, Clock, ShoppingCart, MessageCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      window.location.href = '/';
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      await login('admin@pharmacy.com', 'Admin123!');
      window.location.href = '/';
    } catch (err) {
      toast.error('Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white font-sans text-[#475569]">
      {/* Left Panel - Branding (Hidden on Mobile) */}
      <div className="hidden lg:flex flex-col justify-center items-center w-1/2 bg-[#1E3A5F] relative overflow-hidden text-white p-12">
        {/* Animated background shapes */}
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.2, 0.3] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-gradient-to-br from-[#0EA5E9]/40 to-transparent blur-3xl"
        />
        <motion.div 
          animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear', delay: 5 }}
          className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-tl from-[#38bdf8]/30 to-transparent blur-3xl"
        />

        <div className="relative z-10 w-full max-w-md">
          {/* Logo */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-4 mb-16"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0EA5E9] to-[#0284C7] flex items-center justify-center shadow-lg shadow-[#0EA5E9]/20">
              <Activity size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-5xl font-bold font-heading tracking-tight">SPMS</h1>
              <p className="text-lg text-[#38bdf8] font-medium tracking-widest uppercase mt-1">Smart Pharmacy</p>
            </div>
          </motion.div>

          {/* Value Props */}
          <div className="space-y-8">
            {[
              { icon: Clock, text: 'Track expiry in real time' },
              { icon: ShoppingCart, text: 'Bill customers in 60 seconds' },
              { icon: MessageCircle, text: 'Reorder from WhatsApp' },
            ].map((prop, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + (i * 0.1) }}
                className="flex items-center gap-4 text-lg font-medium"
              >
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/10 shadow-sm backdrop-blur-sm">
                  <prop.icon size={24} className="text-[#38bdf8]" />
                </div>
                {prop.text}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-24 relative">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <div className="flex lg:hidden items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#1E3A5F] to-[#0EA5E9] flex items-center justify-center shadow-sm">
              <Activity size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-heading text-[#0F172A] tracking-tight">SPMS</h1>
            </div>
          </div>

          <h2 className="text-3xl font-bold font-heading text-[#0F172A] mb-2">Welcome back</h2>
          <p className="text-[#64748B] mb-10">Sign in to your pharmacy dashboard</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="form-label">Email Address</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                className="input-field" 
                placeholder="name@pharmacy.com"
              />
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="form-label !mb-0">Password</label>
                <a href="#" className="text-sm font-semibold text-[#0EA5E9] hover:text-[#0284C7] transition-colors">Forgot?</a>
              </div>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                className="input-field" 
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" loading={loading} className="w-full h-12 text-[15px] mt-2">
              Sign in
            </Button>
          </form>

          <div className="mt-8 pt-8 border-t border-[#E2E8F0]">
            <div className="bg-[#F8FAFC] rounded-xl p-5 border border-[#E2E8F0]">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-[#0EA5E9] mt-0.5 flex-shrink-0" size={18} />
                <div>
                  <h4 className="font-semibold text-[#0F172A] text-sm">Evaluating the software?</h4>
                  <p className="text-xs text-[#64748B] mt-1 mb-3">Experience the full platform instantly without setting up a backend server.</p>
                  <Button variant="outline" onClick={handleDemoLogin} loading={loading} className="w-full bg-white text-sm">
                    Enter Demo Mode
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-sm mt-8 text-[#64748B]">
            Don't have an account? <a href="#" className="font-semibold text-[#0EA5E9] hover:text-[#0284C7] transition-colors">Start free trial</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
