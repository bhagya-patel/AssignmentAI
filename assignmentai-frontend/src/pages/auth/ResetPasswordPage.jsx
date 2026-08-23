import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, Bot, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { resetPassword } from '../../services/authService';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../components/shared/Toast';

const inputCls = (hasIcon, hasError) =>
  [
    'w-full rounded-xl border bg-white/80 px-4 py-3 text-sm text-slate-800',
    'placeholder:text-slate-400 outline-none transition-all duration-200',
    'focus:bg-white focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]',
    hasIcon ? 'pl-10' : '',
    hasError ? 'border-red-400 focus:border-red-400' : 'border-slate-200 focus:border-indigo-400',
  ].join(' ');

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const token = searchParams.get('token');

  const [pass,    setPass]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [errors,  setErrors]  = useState({});

  // Redirect if no token
  useEffect(() => {
    if (!token) navigate('/login', { replace: true });
  }, [token, navigate]);

  const validate = () => {
    const e = {};
    if (pass.length < 8)  e.pass    = 'Password must be at least 8 characters';
    if (pass !== confirm)  e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await resetPassword(token, pass);
      setDone(true);
      toast({ type: 'success', title: 'Password reset!', message: 'You can now sign in with your new password.' });
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      const msg = getErrorMessage(err);
      toast({ type: 'error', title: 'Reset failed', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const strength = pass.length === 0 ? 0
    : pass.length < 6 ? 1
    : pass.length < 8 ? 2
    : pass.length < 12 ? 3
    : 4;

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['', '#EF4444', '#F59E0B', '#10B981', '#6366F1'][strength];

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-20px); }
        }
      `}</style>

      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0F0C29, #302B63, #24243E)' }}
      >
        {/* Background blobs */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute w-96 h-96 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #6366F1, transparent)', top: '10%', left: '5%', animation: 'float 8s ease-in-out infinite' }} />
          <div className="absolute w-72 h-72 rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #8B5CF6, transparent)', bottom: '20%', right: '10%', animation: 'float 10s ease-in-out infinite reverse' }} />
        </div>

        <div
          className="relative w-full max-w-md rounded-3xl overflow-hidden"
          style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)' }}
        >
          <div className="bg-slate-50 p-8 sm:p-10" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>
            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shadow-sm ring-1 ring-border bg-white">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <span className="font-bold text-slate-800">AssignmentAI</span>
            </div>

            {done ? (
              /* ── Success state ─────────────────────────────────────── */
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h1 className="text-xl font-bold text-slate-800 mb-2">Password Updated!</h1>
                <p className="text-slate-500 text-sm mb-6">
                  Your password has been changed successfully. Redirecting you to sign in…
                </p>
                <Link
                  to="/login"
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
                >
                  Go to Sign In <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              /* ── Reset form ────────────────────────────────────────── */
              <>
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-800 mb-1">Set new password</h1>
                <p className="text-slate-500 text-sm mb-7">
                  Choose a strong password for your AssignmentAI account.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* New password */}
                  <div className="space-y-1.5">
                    <label htmlFor="new-pass" className="block text-sm font-medium text-slate-700">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        id="new-pass"
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
                      >
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.pass && (
                      <p className="text-red-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {errors.pass}
                      </p>
                    )}
                  </div>

                  {/* Strength meter */}
                  {pass.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1">
                        {[1,2,3,4].map(i => (
                          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                            style={{ background: i <= strength ? strengthColor : '#E2E8F0' }} />
                        ))}
                      </div>
                      <p className="text-xs text-slate-400">{strengthLabel} password</p>
                    </div>
                  )}

                  {/* Confirm password */}
                  <div className="space-y-1.5">
                    <label htmlFor="confirm-pass" className="block text-sm font-medium text-slate-700">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        id="confirm-pass"
                        type={show ? 'text' : 'password'}
                        className={inputCls(true, !!errors.confirm)}
                        value={confirm}
                        onChange={e => { setConfirm(e.target.value); setErrors(p => ({ ...p, confirm: '' })); }}
                        placeholder="Re-enter new password"
                        required
                        autoComplete="new-password"
                      />
                    </div>
                    {errors.confirm && (
                      <p className="text-red-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {errors.confirm}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200 mt-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:opacity-70"
                    style={{ background: loading ? '#818CF8' : 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
                  >
                    {loading ? (
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Update Password <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </form>

                <p className="text-center text-sm text-slate-500 mt-6">
                  Remember your password?{' '}
                  <Link to="/login" className="text-indigo-600 font-semibold hover:text-indigo-800 transition-colors">
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
