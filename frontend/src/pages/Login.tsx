import { useState } from 'react';
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
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 mb-4">
            <Film className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-3xl font-bold text-white">CG HR</h1>
          <p className="text-primary-400 mt-1">Cinegrand HR Platform</p>
        </div>

        <div className="card p-8">
          {!show2FA ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <h2 className="text-xl font-semibold text-center mb-2 text-white">Sign In</h2>

              {error && (
                <div className="p-3 rounded-lg bg-red-900/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input-field" placeholder="name@cinegrand.bg" required autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pr-10" placeholder="Enter your password" required
                  />
                  <button
                    type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                Access restricted. Contact your administrator for credentials.
              </p>
            </form>
          ) : (
            <form onSubmit={handle2FA} className="space-y-5">
              <h2 className="text-xl font-semibold text-center mb-2 text-white">Two-Factor Authentication</h2>
              <p className="text-sm text-gray-400 text-center">
                Enter the code from your authenticator app
              </p>

              {error && (
                <div className="p-3 rounded-lg bg-red-900/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div>
                <input
                  type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value)}
                  className="input-field text-center text-2xl tracking-widest" placeholder="000000"
                  maxLength={8} required autoFocus
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
              </button>

              <button type="button" onClick={() => { setShow2FA(false); setError(''); }} className="text-sm text-gray-500 hover:text-primary-400 w-full text-center">
                Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
