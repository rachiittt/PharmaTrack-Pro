import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MailCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { InlineAlert } from '../components/ui/States';

/** Plain-language auth errors (Supabase returns technical ones for network failures). */
function authMessage(err) {
  const m = err?.message || '';
  if (/fetch|network|load failed/i.test(m) || err?.name === 'AuthRetryableFetchError') return 'Cannot reach the server. Check your internet connection and try again.';
  if (m === 'Invalid login credentials') return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email address first — check your inbox for the link.';
  return m || 'Something went wrong. Please try again.';
}

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary" aria-hidden>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
            </div>
            <span className="text-[15px] font-semibold text-ink">PharmaTrack Pro</span>
          </div>
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-sm text-ink-3">{footer}</div>}
        </div>
      </div>
      <aside className="hidden w-[44%] max-w-[620px] flex-col justify-between bg-sidebar p-10 text-sidebar-ink lg:flex">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-ink/60">For independent pharmacies & chains</div>
        <div>
          <p className="max-w-md text-[28px] font-semibold leading-tight text-sidebar-ink-strong">
            Every strip, every batch, every expiry — accounted for.
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 text-sm">
            {[['FEFO', 'billing from the earliest-expiring batch'], ['GST', 'tax invoices with CGST/SGST split'], ['RLS', 'each pharmacy sees only its own data']].map(([k, v]) => (
              <div key={k}><dt className="code text-base font-semibold text-sidebar-ink-strong">{k}</dt><dd className="mt-1 text-xs leading-snug text-sidebar-ink/80">{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="text-xs text-sidebar-ink/50">© {new Date().getFullYear()} PharmaTrack Pro</div>
      </aside>
    </div>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('login'); // login | forgot | sent

  async function signIn(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(authMessage(err));
  }

  async function sendReset(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (err) setError(authMessage(err)); else setMode('sent');
  }

  if (mode === 'sent') {
    return (
      <AuthLayout title="Check your email" subtitle={`If an account exists for ${email}, we've sent a link to reset the password.`}
        footer={<button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode('login')}>Back to sign in</button>}>
        <MailCheck className="text-primary" size={36} aria-hidden />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={mode === 'forgot' ? 'Reset your password' : 'Sign in'}
      subtitle={mode === 'forgot' ? "We'll email you a reset link." : 'Welcome back. Sign in to your pharmacy.'}
      footer={mode === 'login'
        ? <>New to PharmaTrack? <Link to="/signup" className="font-medium text-primary hover:underline">Create an account</Link></>
        : <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode('login')}>Back to sign in</button>}
    >
      <form onSubmit={mode === 'forgot' ? sendReset : signIn} className="space-y-4">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode === 'login' && (
          <div>
            <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => { setMode('forgot'); setError(null); }} className="mt-1.5 text-xs font-medium text-ink-3 hover:text-primary">Forgot password?</button>
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{mode === 'forgot' ? 'Send reset link' : 'Sign in'}</Button>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (form.password.length < 8) { setError('Use at least 8 characters for the password.'); return; }
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { full_name: form.full_name.trim(), phone: form.phone.trim() || null }, emailRedirectTo: `${window.location.origin}/` },
    });
    setBusy(false);
    if (err) { setError(authMessage(err)); return; }
    if (!data.session) setConfirmSent(true);
    else toast.success('Account created');
  }

  if (confirmSent) {
    return (
      <AuthLayout title="Confirm your email" subtitle={`We sent a confirmation link to ${form.email}. Open it to finish creating your account.`}
        footer={<Link to="/login" className="font-medium text-primary hover:underline">Back to sign in</Link>}>
        <MailCheck className="text-primary" size={36} aria-hidden />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="You'll set up your pharmacy next. Staff are invited by the owner."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <Input label="Your name" required autoComplete="name" value={form.full_name} onChange={set('full_name')} />
        <Input label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        <Input label="Mobile" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="+91" />
        <Input label="Password" type="password" required autoComplete="new-password" minLength={8} value={form.password} onChange={set('password')} hint="At least 8 characters" />
        <Button type="submit" size="lg" className="w-full" loading={busy}>Create account</Button>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(/session/i.test(err.message) ? 'This reset link has expired. Request a new one from the sign-in page.' : authMessage(err)); return; }
    toast.success('Password updated');
    navigate('/');
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <Input label="New password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" size="lg" className="w-full" loading={busy}>Update password</Button>
      </form>
    </AuthLayout>
  );
}

/** Shown when the frontend has no Supabase project configured — no fake data fallback. */
export function SetupRequired() {
  return (
    <AuthLayout title="Connect a Supabase project" subtitle="PharmaTrack stores every record in your Supabase database. It isn't configured yet.">
      <ol className="list-decimal space-y-3 pl-5 text-sm text-ink-2">
        <li>Create a project at supabase.com and run the migrations in <span className="code">supabase/migrations</span>.</li>
        <li>Copy <span className="code">frontend/.env.example</span> to <span className="code">frontend/.env.local</span> and set
          <span className="code"> VITE_SUPABASE_URL</span> and <span className="code">VITE_SUPABASE_ANON_KEY</span>.</li>
        <li>Restart <span className="code">npm run dev</span>.</li>
      </ol>
      <p className="mt-5 text-xs text-ink-3">Full steps are in the README under “Supabase configuration”.</p>
    </AuthLayout>
  );
}
