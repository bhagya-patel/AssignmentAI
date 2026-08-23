import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Bot, User,
  GraduationCap, Briefcase, ShieldCheck, ChevronLeft,
  CheckCircle2, Sparkles, Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/shared/Toast';
import { getErrorMessage } from '../../services/api';
import { signup as apiSignup, forgotPassword as apiForgotPassword } from '../../services/authService';

// ── Constants ──────────────────────────────────────────────────────────────────
const ROLES = [
  { id: 'Student', label: 'Student',  Icon: GraduationCap, home: '/student' },
  { id: 'Teacher', label: 'Teacher',  Icon: Briefcase,      home: '/teacher' },
  { id: 'TA',      label: 'TA',       Icon: User,           home: '/ta'      },
  { id: 'Admin',   label: 'Admin',    Icon: ShieldCheck,    home: '/admin'   },
];

// ── Floating orb decoration ───────────────────────────────────────────────────
function Orb({ className }) {
  return <div className={`absolute rounded-full pointer-events-none ${className}`} />;
}

// ── Animated stat pill ────────────────────────────────────────────────────────
function StatPill({ value, label, delay = '0s' }) {
  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-full"
      style={{
        background: 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.18)',
        animation: `fadeSlideUp 0.6s ease both`,
        animationDelay: delay,
      }}
    >
      <span className="text-white font-bold text-sm">{value}</span>
      <span className="text-white/60 text-xs">{label}</span>
    </div>
  );
}

// ── Feature item ──────────────────────────────────────────────────────────────
function Feature({ text, delay = '0s' }) {
  return (
    <div
      className="flex items-center gap-2.5"
      style={{ animation: `fadeSlideUp 0.5s ease both`, animationDelay: delay }}
    >
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      <span className="text-white/80 text-sm">{text}</span>
    </div>
  );
}

// ── Input field component ─────────────────────────────────────────────────────
function Field({ label, id, icon: Icon, error, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        )}
        {children}
      </div>
      {error && (
        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}

// ── Shared input style ────────────────────────────────────────────────────────
const inputCls = (hasIcon, hasError) =>
  [
    'w-full rounded-xl border bg-slate-50/50 px-4 py-2.5 sm:py-3 text-sm text-slate-800',
    'placeholder:text-slate-400 outline-none transition-all duration-300',
    'hover:bg-white hover:border-indigo-300',
    'focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10',
    hasIcon ? 'pl-10' : '',
    hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10' : 'border-slate-200',
  ].join(' ');

// ─────────────────────────────────────────────────────────────────────────────
// ── VIEW: LOGIN ──────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function LoginView({ onForgot, onSignup }) {
  const navigate  = useNavigate();
  const { login } = useAuth();
  const toast     = useToast();

  const [role,     setRole]    = useState('Teacher');
  const [email,    setEmail]   = useState('');
  const [pass,     setPass]    = useState('');
  const [show,     setShow]    = useState(false);
  const [loading,  setLoading] = useState(false);
  const [fieldErr, setErr]     = useState('');

  const handleRoleSelect = (id) => {
    setRole(id);
    setErr('');
  };

  const roleHome = { Student: '/student', Teacher: '/teacher', Admin: '/admin', Ta: '/ta', TA: '/ta' };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const user = await login(email, pass, role);
      toast({ type: 'success', title: `Welcome back, ${user.name.split(' ')[0]}! 👋` });
      // Navigate using the actual role from the server, not the UI-selected role
      const actualRole = user.role.charAt(0).toUpperCase() + user.role.slice(1);
      navigate(roleHome[actualRole] ?? '/login');
    } catch (err) {
      const msg = getErrorMessage(err);
      setErr(msg);
      toast({ type: 'error', title: 'Login failed', message: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-indigo-600 text-xs font-semibold tracking-wide">AI-Powered Platform</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800 leading-tight">Welcome back</h1>
        <p className="text-slate-500 text-sm mt-1">Sign in to continue to AssignmentAI</p>
      </div>

      {/* Role selector */}
      <div className="grid grid-cols-4 gap-2 mb-7 p-1 bg-slate-100 rounded-2xl">
        {ROLES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleRoleSelect(id)}
            className={[
              'flex flex-col items-center gap-1 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-all duration-300',
              role === id
                ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100/50 scale-[1.02] ring-1 ring-black/5'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50',
            ].join(' ')}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Admin info hint */}
      {role === 'Admin' && (
        <div className="mb-4 flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
          <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
          <p className="text-xs text-indigo-700 leading-relaxed">
            Admin access is restricted. Use the official admin credentials to sign in.
          </p>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
        <Field label="Email Address" id="email" icon={Mail}>
          <input
            id="email"
            type="email"
            className={inputCls(true, false)}
            value={email}
            onChange={e => { setEmail(e.target.value); setErr(''); }}
            placeholder="you@university.edu"
            required
            autoComplete="off"
          />
        </Field>

        <Field label="Password" id="password" icon={Lock} error={fieldErr}>
          <input
            id="password"
            type={show ? 'text' : 'password'}
            className={`${inputCls(true, !!fieldErr)} pr-11`}
            value={pass}
            onChange={e => { setPass(e.target.value); setErr(''); }}
            placeholder="••••••••"
            required
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Toggle password"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </Field>

        {/* Remember + Forgot */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              defaultChecked
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 accent-indigo-600"
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={onForgot}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            Forgot password?
          </button>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-300 mt-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:opacity-70 hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5"
          style={{ background: loading ? '#818CF8' : 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>Sign In <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-slate-400 text-xs font-medium">or continue with</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* OAuth */}
      <div className="grid grid-cols-2 gap-3">
        <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-all duration-300 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 19.07 11H12v2.75h7.86A7.49 7.49 0 0 1 4.64 17.4l-3.16 2.41A11.98 11.98 0 0 0 24 12c0-.67-.06-1.32-.17-1.95H12v3.7h6.44a5.5 5.5 0 0 1-2.36 3.6l3.4 2.63A11.98 11.98 0 0 0 5.27 9.76Z"/>
            <path fill="#4285F4" d="M12 24c3.24 0 5.95-1.08 7.93-2.92l-3.4-2.63a7.48 7.48 0 0 1-11.3-3.9l-3.16 2.41A11.98 11.98 0 0 0 12 24Z"/>
            <path fill="#FBBC05" d="M5.16 14.55A7.05 7.05 0 0 1 4.77 12c0-.88.15-1.73.39-2.55l-3.52-2.7A11.98 11.98 0 0 0 0 12c0 1.93.46 3.76 1.27 5.38l3.89-2.83Z"/>
            <path fill="#34A853" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A11.98 11.98 0 0 0 1.64 6.62l3.52 2.7A7.08 7.08 0 0 1 12 4.75Z"/>
          </svg>
          Google
        </button>
        <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-all duration-300 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
            <rect x="13" y="1"  width="10" height="10" fill="#7FBA00"/>
            <rect x="1"  y="13" width="10" height="10" fill="#00A4EF"/>
            <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
          </svg>
          Microsoft
        </button>
      </div>

      {/* Footer — hide signup link for Admin */}
      {role !== 'Admin' && (
        <p className="text-center text-sm text-slate-500 mt-8">
          Don't have an account?{' '}
          <button
            onClick={onSignup}
            className="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
          >
            Create account
          </button>
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── VIEW: SIGN UP ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function SignupView({ onBack }) {
  const navigate  = useNavigate();
  const { login } = useAuth();
  const toast = useToast();

  const [role,     setRole]    = useState('Student');
  const [name,     setName]    = useState('');
  const [email,    setEmail]   = useState('');
  const [pass,     setPass]    = useState('');
  const [confirm,  setConfirm] = useState('');
  const [show,     setShow]    = useState(false);
  const [loading,  setLoading] = useState(false);
  const [success,  setSuccess] = useState(false);
  const [errors,   setErrors]  = useState({});

  const validate = () => {
    const e = {};
    if (!name.trim())              e.name    = 'Full name is required';
    if (!email.trim())             e.email   = 'Email is required';
    if (pass.length < 8)           e.pass    = 'Password must be at least 8 characters';
    if (pass !== confirm)          e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // Signup and immediately log in using the returned token
      await apiSignup({ name, email, password: pass, role: role.toLowerCase() });
      setSuccess(true);
      toast({ type: 'success', title: 'Account created!', message: `Welcome to AssignmentAI, ${name.split(' ')[0]}!` });
      // Auto-login: sign in with the same credentials after account creation
      const roleHome = { Student: '/student', Teacher: '/teacher', Admin: '/admin', Ta: '/ta', TA: '/ta' };
      const user = await login(email, pass, role);
      const actualRole = user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase();
      navigate(roleHome[actualRole] ?? roleHome[user.role.toUpperCase()] ?? '/login');
    } catch (err) {
      const msg = getErrorMessage(err);
      setSuccess(false);
      toast({ type: 'error', title: 'Signup failed', message: msg });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full flex flex-col items-center text-center py-8" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Account created!</h2>
        <p className="text-slate-500 text-sm mb-4 max-w-xs">
          Signing you in as a <strong className="text-slate-700">{role}</strong>…
        </p>
        <span className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>
      {/* Header */}
      <div className="mb-7">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors mb-4 font-medium"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Sign In
        </button>
        <h1 className="text-2xl font-bold text-slate-800">Create account</h1>
        <p className="text-slate-500 text-sm mt-1">Join AssignmentAI and get started</p>
      </div>

      {/* Role selector — Admin excluded from signup */}
      <div className="grid grid-cols-3 gap-2 mb-6 p-1 bg-slate-100 rounded-2xl">
        {ROLES.filter(r => r.id !== 'Admin').map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setRole(id)}
            className={[
              'flex flex-col items-center gap-1 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-all duration-300',
              role === id
                ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100/50 scale-[1.02] ring-1 ring-black/5'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50',
            ].join(' ')}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        <Field label="Full Name" id="su-name" icon={User} error={errors.name}>
          <input
            id="su-name"
            type="text"
            className={inputCls(true, !!errors.name)}
            value={name}
            onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
            placeholder="Dr. / Mr. / Ms. Your Name"
            required
            autoComplete="name"
          />
        </Field>

        <Field label="Email Address" id="su-email" icon={Mail} error={errors.email}>
          <input
            id="su-email"
            type="email"
            className={inputCls(true, !!errors.email)}
            value={email}
            onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })); }}
            placeholder="you@university.edu"
            required
            autoComplete="email"
          />
        </Field>

        <Field label="Password" id="su-pass" icon={Lock} error={errors.pass}>
          <input
            id="su-pass"
            type={show ? 'text' : 'password'}
            className={`${inputCls(true, !!errors.pass)} pr-11`}
            value={pass}
            onChange={e => { setPass(e.target.value); setErrors(p => ({ ...p, pass: '' })); }}
            placeholder="Min. 8 characters"
            required
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Toggle password"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </Field>

        {/* Password strength */}
        {pass.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {[1,2,3,4].map(i => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{
                    background: i <= Math.min(4, Math.floor(pass.length / 2))
                      ? pass.length < 6 ? '#EF4444'
                        : pass.length < 8 ? '#F59E0B'
                        : pass.length < 12 ? '#10B981'
                        : '#6366F1'
                      : '#E2E8F0'
                  }}
                />
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {pass.length < 6 ? 'Weak' : pass.length < 8 ? 'Fair' : pass.length < 12 ? 'Good' : 'Strong'} password
            </p>
          </div>
        )}

        <Field label="Confirm Password" id="su-confirm" icon={Lock} error={errors.confirm}>
          <input
            id="su-confirm"
            type={show ? 'text' : 'password'}
            className={inputCls(true, !!errors.confirm)}
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setErrors(p => ({ ...p, confirm: '' })); }}
            placeholder="Re-enter password"
            required
            autoComplete="new-password"
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200 mt-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:opacity-70"
          style={{ background: loading ? '#818CF8' : 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>Create Account <ArrowRight className="w-4 h-4" /></>
          )}
        </button>

        <p className="text-center text-xs text-slate-400 pt-1">
          By creating an account, you agree to our{' '}
          <button className="text-indigo-500 hover:underline">Terms of Service</button>
          {' '}and{' '}
          <button className="text-indigo-500 hover:underline">Privacy Policy</button>
        </p>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── VIEW: FORGOT PASSWORD ────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function ForgotView({ onBack }) {
  const toast = useToast();

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiForgotPassword(email);
      setSent(true);
      toast({ type: 'success', title: 'Reset link sent!', message: 'Check your email for a password reset link.' });
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ type: 'error', title: 'Failed to send', message: msg });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="w-full flex flex-col items-center text-center py-8" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>
        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
          <Send className="w-7 h-7 text-indigo-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Email sent!</h2>
        <p className="text-slate-500 text-sm mb-6 max-w-xs">
          We've sent a reset link to{' '}
          <strong className="text-slate-700">{email}</strong>. Check your inbox and follow the instructions.
        </p>
        <p className="text-slate-400 text-xs mb-6">
          Didn't receive it?{' '}
          <button
            onClick={() => setSent(false)}
            className="text-indigo-500 hover:underline font-medium"
          >
            Resend email
          </button>
        </p>
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="w-full" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors mb-4 font-medium"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Sign In
        </button>
        <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-indigo-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Forgot password?</h1>
        <p className="text-slate-500 text-sm mt-1.5">
          No worries! Enter your email and we'll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email Address" id="fp-email" icon={Mail}>
          <input
            id="fp-email"
            type="email"
            className={inputCls(true, false)}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@university.edu"
            required
            autoComplete="email"
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200 mt-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:opacity-70"
          style={{ background: loading ? '#818CF8' : 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>Send Reset Link <Send className="w-4 h-4" /></>
          )}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-8">
        Remember your password?{' '}
        <button
          onClick={onBack}
          className="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── MAIN: AuthPage ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  // 'login' | 'signup' | 'forgot'
  const [view, setView] = useState('login');
  const [viewKey, setViewKey] = useState(0);

  const switchView = (v) => {
    setView(v);
    setViewKey(k => k + 1); // remount for animation
  };

  const leftContent = {
    login: {
      title: 'Intelligent Grading.\nLive Evaluation.',
      subtitle: 'The AI-powered academic platform built for modern universities.',
      features: [
        'AI-powered assignment grading',
        'Real-time viva monitoring',
        'Multi-role access control',
        'Detailed analytics & reports',
      ],
    },
    signup: {
      title: 'Join 1,200+\nEducators & Students',
      subtitle: 'Start your journey with the most advanced academic evaluation platform.',
      features: [
        'Free 30-day trial',
        'No credit card required',
        'Setup in under 5 minutes',
        'Dedicated onboarding support',
      ],
    },
    forgot: {
      title: 'Account\nRecovery',
      subtitle: 'We make it easy to get back into your account securely.',
      features: [
        'Instant reset link via email',
        'Secure password reset flow',
        'Two-factor authentication support',
        '24/7 support available',
      ],
    },
  };

  const content = leftContent[view];

  return (
    <>
      {/* Global animation keyframes */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-20px); }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%       { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <div
        className="min-h-screen flex items-center justify-center p-2 sm:p-4"
        style={{ background: 'linear-gradient(135deg, #0F0C29, #302B63, #24243E)' }}
      >
        {/* Floating background blobs */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute w-96 h-96 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, #6366F1, transparent)',
              top: '10%', left: '5%',
              animation: 'float 8s ease-in-out infinite',
            }}
          />
          <div
            className="absolute w-72 h-72 rounded-full opacity-15"
            style={{
              background: 'radial-gradient(circle, #8B5CF6, transparent)',
              top: '60%', right: '10%',
              animation: 'float 10s ease-in-out infinite reverse',
            }}
          />
          <div
            className="absolute w-48 h-48 rounded-full opacity-10"
            style={{
              background: 'radial-gradient(circle, #EC4899, transparent)',
              bottom: '15%', left: '40%',
              animation: 'pulse-slow 6s ease-in-out infinite',
            }}
          />
          {/* Grid lines */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        {/* Card */}
        <div
          className="relative w-full max-w-5xl flex rounded-2xl sm:rounded-3xl overflow-hidden"
          style={{
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
          <div
            className="hidden lg:flex flex-col justify-between w-5/12 p-10 relative overflow-hidden"
            style={{ background: 'linear-gradient(145deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
          >
            {/* Decorative rings */}
            <div
              className="absolute -top-32 -left-32 w-96 h-96 rounded-full border border-white/5 bg-white/[0.02]"
              style={{ animation: 'spin-slow 40s linear infinite' }}
            />
            <div
              className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full border border-white/5 bg-white/[0.01]"
              style={{ animation: 'spin-slow 30s linear infinite reverse' }}
            />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

            {/* Logo */}
            <div className="relative z-10" style={{ animation: 'fadeSlideUp 0.5s ease both' }}>
              <div className="flex items-center gap-3 mb-10">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden shadow-2xl ring-2 ring-white/10 bg-white">
                  <img src="/logo.png" alt="AssignmentAI Logo" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-white font-bold text-lg leading-none">AssignmentAI</p>
                  <p className="text-indigo-300 text-xs mt-0.5">Academic Intelligence</p>
                </div>
              </div>

              {/* Dynamic text */}
              <div key={view} style={{ animation: 'fadeSlideUp 0.5s ease both' }}>
                <h2
                  className="text-3xl lg:text-4xl font-extrabold leading-tight mb-4 text-transparent bg-clip-text bg-gradient-to-br from-white via-indigo-100 to-indigo-300 drop-shadow-sm"
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {content.title}
                </h2>
                <p className="text-white/70 text-sm lg:text-base leading-relaxed mb-8 max-w-sm">
                  {content.subtitle}
                </p>

                <div className="space-y-3">
                  {content.features.map((f, i) => (
                    <Feature key={f} text={f} delay={`${i * 0.08}s`} />
                  ))}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="relative z-10" style={{ animation: 'fadeSlideUp 0.7s ease both' }}>
              <div className="flex flex-wrap gap-2 mb-6">
                <StatPill value="94.7%" label="AI Accuracy"     delay="0.1s" />
                <StatPill value="1,247" label="Students Active" delay="0.2s" />
                <StatPill value="🔴 Live" label="2 Sessions"   delay="0.3s" />
              </div>


            </div>
          </div>

          {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
          <div className="flex-1 bg-white p-5 sm:p-8 lg:p-12 flex flex-col justify-center overflow-y-auto max-h-screen relative z-0">
            
            {/* Subtle desktop dotted texture */}
            <div 
              className="absolute inset-0 opacity-[0.03] pointer-events-none hidden lg:block -z-10" 
              style={{ 
                backgroundImage: 'radial-gradient(circle at 1px 1px, black 1px, transparent 0)', 
                backgroundSize: '24px 24px' 
              }} 
            />
            
            {/* Subtle mobile background glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-50 -z-10 pointer-events-none lg:hidden" />
            
            {/* Mobile logo */}
            <div className="flex lg:hidden items-center justify-center gap-2.5 mb-8 mt-2">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden shadow-md ring-1 ring-border bg-white">
                <img src="/logo.png" alt="AssignmentAI Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-lg leading-none">AssignmentAI</p>
                <p className="text-[10px] text-slate-500 font-medium">Academic Intelligence</p>
              </div>
            </div>

            <div key={viewKey} className="w-full max-w-sm mx-auto">
              {view === 'login'  && <LoginView  onForgot={() => switchView('forgot')} onSignup={() => switchView('signup')} />}
              {view === 'signup' && <SignupView onBack={() => switchView('login')} />}
              {view === 'forgot' && <ForgotView onBack={() => switchView('login')} />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
