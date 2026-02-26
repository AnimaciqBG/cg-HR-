import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Eye, EyeOff, Loader2, Film } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login, verify2FA } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${e.clientX - 300}px, ${e.clientY - 300}px)`;
      }
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.requiresTwoFactor) {
        setShow2FA(true);
        setTempToken(result.tempToken || '');
      } else {
        // Fetch user data to check mustChangePassword
        const { fetchUser } = useAuthStore.getState();
        await fetchUser();
        const currentUser = useAuthStore.getState().user;
        if (currentUser?.mustChangePassword) {
          navigate('/change-password');
        } else {
          navigate('/');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handle2FA(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verify2FA(tempToken, totpCode);
      const { fetchUser } = useAuthStore.getState();
      await fetchUser();
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020202] p-4 grain-overlay relative overflow-hidden">
      {/* Ambient cursor glow */}
      <div ref={glowRef} className="ambient-glow" />

      {/* Static decorative glow */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-30 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(217, 176, 97, 0.08) 0%, transparent 60%)' }} />

      <div className="w-full max-w-md relative z-[1]">
        {/* Logo section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[1.5rem] mb-6 shadow-gold-lg animate-float" style={{ background: 'linear-gradient(135deg, #D9B061, #8A6D3B)' }}>
            <Film className="w-9 h-9 text-[#020202]" />
          </div>
          <h1 className="text-4xl font-bold italic text-gradient-gold-animated">CG HR</h1>
          <p className="text-quantum-zinc mt-2 text-sm uppercase tracking-[0.3em]">Cinegrand HR Platform</p>
        </div>

        {/* Login card */}
        <div className="card p-10">
          {!show2FA ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <h2 className="text-xl font-semibold text-center text-white tracking-wide">Sign In</h2>
              <div className="gold-line" />

              {error && (
                <div className="p-4 rounded-2xl text-sm" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <div>
                <label className="label-luxury mb-2 block">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input-field" placeholder="name@cinegrand.bg" required autoFocus
                />
              </div>

              <div>
                <label className="label-luxury mb-2 block">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pr-12" placeholder="Enter your password" required
                  />
                  <button
                    type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-quantum-zinc hover:text-primary-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
              </button>

              <p className="text-xs text-quantum-zinc text-center tracking-wider">
                Access restricted. Contact your administrator for credentials.
              </p>
            </form>
          ) : (
            <form onSubmit={handle2FA} className="space-y-6">
              <h2 className="text-xl font-semibold text-center text-white tracking-wide">Two-Factor Authentication</h2>
              <div className="gold-line" />
              <p className="text-sm text-quantum-zinc text-center tracking-wide">
                Enter the code from your authenticator app
              </p>

              {error && (
                <div className="p-4 rounded-2xl text-sm" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <div>
                <input
                  type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value)}
                  className="input-field text-center text-2xl tracking-[0.5em] font-light" placeholder="000000"
                  maxLength={8} required autoFocus
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
              </button>

              <button type="button" onClick={() => { setShow2FA(false); setError(''); }} className="text-sm text-quantum-zinc hover:text-primary-400 w-full text-center transition-colors tracking-wide">
                Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
