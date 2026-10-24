import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Pill, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, Building2, User, Mail, Phone, Lock, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    period: '/month',
    features: ['Up to 100 medicines', 'Basic expiry alerts', 'Manual billing', 'Email support'],
    color: 'from-slate-500 to-slate-600',
    borderColor: 'border-white/[0.08]',
    recommended: false,
  },
  {
    name: 'Pro',
    price: '₹2,999',
    period: '/month',
    features: ['Unlimited medicines', '5-tier expiry system', 'Barcode scanning', 'WhatsApp alerts', 'Analytics dashboard', 'Priority support'],
    color: 'from-primary-500 to-primary-700',
    borderColor: 'border-primary-500/30',
    recommended: true,
  },
];

const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { test: (p) => /[0-9]/.test(p), label: 'One number' },
  { test: (p) => /[!@#$%^&*]/.test(p), label: 'One special character' },
];

export default function Signup() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    full_name: '',
    pharmacy_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    gst_number: '',
    agree_terms: false,
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const firstInputRef = useRef(null);
  const { signup, user } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  // Auto-focus first input on step change
  useEffect(() => {
    setTimeout(() => firstInputRef.current?.focus(), 100);
  }, [step]);

  const updateField = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm({ ...form, [field]: value });
  };

  const passwordStrength = PASSWORD_RULES.filter(r => r.test(form.password)).length;
  const strengthColor = passwordStrength <= 1 ? 'bg-red-500' : passwordStrength <= 2 ? 'bg-orange-500' : passwordStrength <= 3 ? 'bg-amber-500' : 'bg-emerald-500';
  const strengthLabel = passwordStrength <= 1 ? 'Weak' : passwordStrength <= 2 ? 'Fair' : passwordStrength <= 3 ? 'Good' : 'Strong';

  const validateStep1 = () => {
    if (!form.full_name.trim()) { toast.error('Please enter your full name'); return false; }
    if (!form.pharmacy_name.trim()) { toast.error('Please enter your pharmacy name'); return false; }
    if (!form.phone.trim()) { toast.error('Please enter your phone number'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!form.email.trim()) { toast.error('Please enter your email'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error('Please enter a valid email'); return false; }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return false; }
    if (passwordStrength < 3) { toast.error('Password is too weak — add uppercase, numbers, or special chars'); return false; }
    if (form.password !== form.confirm_password) { toast.error('Passwords do not match'); return false; }
    if (!form.agree_terms) { toast.error('Please agree to the terms'); return false; }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep2()) return;

    setLoading(true);
    try {
      const user = await signup({
        full_name: form.full_name.trim(),
        pharmacy_name: form.pharmacy_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        gst_number: form.gst_number.trim() || undefined,
      });
      toast.success(`Welcome to PharmaTrack Pro, ${user.full_name?.split(' ')[0]}! 🎉`);
      window.location.href = '/';
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const InputField = ({ icon: Icon, label, field, type = 'text', placeholder, required = true, autoRef = false, autoComplete }) => (
    <div>
      <label className="block text-sm font-semibold text-slate-300 mb-2">{label}</label>
      <div className={`relative rounded-xl transition-all duration-200 ${focusedField === field ? 'ring-2 ring-primary-500/50' : ''}`}>
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
          <Icon size={16} />
        </div>
        <input
          ref={autoRef ? firstInputRef : undefined}
          type={type}
          required={required}
          value={form[field]}
          onChange={updateField(field)}
          onFocus={() => setFocusedField(field)}
          onBlur={() => setFocusedField(null)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full pl-10 pr-4 py-3.5 bg-white/[0.06] border border-white/[0.1] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:bg-white/[0.08] focus:border-primary-500/50 transition-all"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-950 via-[#0a1628] to-slate-950 overflow-hidden relative">
      {/* Ambient Glow */}
      <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-primary-600/6 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Left — Plans Preview (desktop only) */}
      <div className="hidden lg:flex lg:w-[45%] items-center justify-center p-12 relative">
        <div className="max-w-md relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-4 mb-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-400 via-primary-500 to-primary-700 flex items-center justify-center shadow-2xl shadow-primary-500/30 ring-2 ring-primary-400/20">
              <Pill size={30} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">PharmaTrack Pro</h1>
              <p className="text-xs text-primary-300/80 font-semibold uppercase tracking-[0.2em] mt-0.5">Smart Pharmacy Management</p>
            </div>
          </div>

          <h2 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Start managing{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-300 via-blue-300 to-accent-400">
              smarter today.
            </span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-10">
            Join 2,000+ pharmacies across India already saving time and money with PharmaTrack Pro.
          </p>

          {/* Plan Cards */}
          <div className="space-y-4">
            {PLANS.map((plan, i) => (
              <div
                key={i}
                className={`relative bg-white/[0.04] backdrop-blur-sm rounded-2xl border ${plan.borderColor} p-5 transition-all ${plan.recommended ? 'ring-1 ring-primary-500/30' : ''}`}
              >
                {plan.recommended && (
                  <div className="absolute -top-2.5 left-5 px-3 py-0.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-full flex items-center gap-1">
                    <Sparkles size={10} /> Recommended
                  </div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    <p className="text-2xl font-extrabold text-white mt-0.5">
                      {plan.price}<span className="text-sm text-slate-500 font-normal">{plan.period}</span>
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center shadow-lg`}>
                    <CheckCircle2 size={20} className="text-white" />
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-slate-400">
                      <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Trust */}
          <div className="flex items-center gap-6 mt-8">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span>14-day free trial</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span>No credit card required</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Signup Form */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-[480px]">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30">
              <Pill size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">PharmaTrack Pro</h1>
              <p className="text-[10px] text-primary-300/70 font-semibold uppercase tracking-widest">Create Account</p>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white/[0.06] backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/20 p-8 border border-white/[0.08] relative overflow-hidden">
            {/* Top glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-primary-400 to-transparent rounded-full" />

            {/* Step Indicator */}
            <div className="flex items-center gap-3 mb-7 mt-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${step >= 1 ? 'bg-primary-500/20 text-primary-300 ring-1 ring-primary-500/30' : 'bg-white/5 text-slate-500'}`}>
                <span className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                Pharmacy Info
              </div>
              <div className="flex-1 h-px bg-white/10" />
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${step >= 2 ? 'bg-primary-500/20 text-primary-300 ring-1 ring-primary-500/30' : 'bg-white/5 text-slate-500'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= 2 ? 'bg-primary-500 text-white' : 'bg-white/10 text-slate-500'}`}>2</span>
                Account Setup
              </div>
            </div>

            {/* Step 1: Pharmacy Info */}
            {step === 1 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Tell us about your pharmacy</h2>
                  <p className="text-slate-400 text-sm">This helps us personalize your experience</p>
                </div>

                <InputField icon={User} label="Full Name *" field="full_name" placeholder="Rajesh Kumar" autoRef autoComplete="name" />
                <InputField icon={Building2} label="Pharmacy Name *" field="pharmacy_name" placeholder="Kumar Medical Store" autoComplete="organization" />
                <InputField icon={Phone} label="Phone Number *" field="phone" type="tel" placeholder="+91 98765 43210" autoComplete="tel" />
                <InputField icon={Building2} label="GST Number (optional)" field="gst_number" placeholder="07AABCU9603R1ZM" required={false} />

                <button
                  type="button"
                  onClick={handleNext}
                  className="group w-full py-3.5 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-semibold rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            )}

            {/* Step 2: Account Setup */}
            {step === 2 && (
              <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Create your account</h2>
                  <p className="text-slate-400 text-sm">Set up your login credentials</p>
                </div>

                <InputField icon={Mail} label="Email Address *" field="email" type="email" placeholder="rajesh@pharmacy.com" autoRef autoComplete="email" />

                {/* Password */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Password *</label>
                  <div className={`relative rounded-xl transition-all duration-200 ${focusedField === 'password' ? 'ring-2 ring-primary-500/50' : ''}`}>
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                      <Lock size={16} />
                    </div>
                    <input
                      type={showPw ? 'text' : 'password'}
                      required
                      value={form.password}
                      onChange={updateField('password')}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Create a strong password"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-12 py-3.5 bg-white/[0.06] border border-white/[0.1] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:bg-white/[0.08] focus:border-primary-500/50 transition-all"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Password Strength Bar */}
                  {form.password && (
                    <div className="mt-2.5">
                      <div className="flex gap-1 mb-1.5">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className={`flex-1 h-1 rounded-full ${passwordStrength >= i ? strengthColor : 'bg-white/10'} transition-all`} />
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-semibold ${passwordStrength >= 3 ? 'text-emerald-400' : passwordStrength >= 2 ? 'text-amber-400' : 'text-red-400'}`}>
                          {strengthLabel}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        {PASSWORD_RULES.map((rule, i) => (
                          <div key={i} className={`flex items-center gap-1.5 text-[10px] ${rule.test(form.password) ? 'text-emerald-400' : 'text-slate-500'}`}>
                            <CheckCircle2 size={10} />
                            {rule.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Confirm Password *</label>
                  <div className={`relative rounded-xl transition-all duration-200 ${focusedField === 'confirm_password' ? 'ring-2 ring-primary-500/50' : ''}`}>
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                      <Lock size={16} />
                    </div>
                    <input
                      type={showConfirmPw ? 'text' : 'password'}
                      required
                      value={form.confirm_password}
                      onChange={updateField('confirm_password')}
                      onFocus={() => setFocusedField('confirm_password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-12 py-3.5 bg-white/[0.06] border border-white/[0.1] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:bg-white/[0.08] focus:border-primary-500/50 transition-all"
                    />
                    <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors">
                      {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {form.confirm_password && form.password !== form.confirm_password && (
                    <p className="text-xs text-red-400 mt-1.5">Passwords do not match</p>
                  )}
                  {form.confirm_password && form.password === form.confirm_password && form.confirm_password.length > 0 && (
                    <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1"><CheckCircle2 size={12} /> Passwords match</p>
                  )}
                </div>

                {/* Terms */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.agree_terms}
                    onChange={updateField('agree_terms')}
                    className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-primary-500 focus:ring-primary-500/30"
                  />
                  <span className="text-xs text-slate-400 leading-relaxed">
                    I agree to the{' '}
                    <button type="button" className="text-primary-400 hover:text-primary-300 font-medium">Terms of Service</button>{' '}
                    and{' '}
                    <button type="button" className="text-primary-400 hover:text-primary-300 font-medium">Privacy Policy</button>
                  </span>
                </label>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="py-3.5 px-5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-sm text-slate-300 font-medium transition-all flex items-center gap-2"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="group flex-1 py-3.5 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-semibold rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Creating account...
                      </span>
                    ) : (
                      <>
                        Create Account
                        <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Sign In Link */}
            <p className="mt-7 text-center text-sm text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
                Sign in
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-600">
            Protected by enterprise-grade security · PharmaTrack Pro © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
