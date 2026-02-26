import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { Eye, EyeOff, Loader2, Lock, Shield, Check, Smartphone, ArrowRight } from 'lucide-react';

const LEADERSHIP_ROLES = ['TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'];

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, fetchUser } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA setup flow (shown after password change for leadership roles)
  const [show2FAPrompt, setShow2FAPrompt] = useState(false);
  const [setting2FA, setSetting2FA] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState('');
  const [twoFAError, setTwoFAError] = useState('');

  // Password strength checks
  const checks = [
    { label: 'At least 12 characters', pass: newPassword.length >= 12 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(newPassword) },
    { label: 'Lowercase letter', pass: /[a-z]/.test(newPassword) },
    { label: 'Number', pass: /[0-9]/.test(newPassword) },
    { label: 'Special character', pass: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword) },
  ];

  const allPassed = checks.every(c => c.pass) && newPassword === confirmPassword && confirmPassword.length > 0;

  const isFirstLogin = user?.mustChangePassword;
  const isLeadership = user?.role && LEADERSHIP_ROLES.includes(user.role);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      await fetchUser();

      // Read fresh state after fetchUser completes
      const freshUser = useAuthStore.getState().user;
      const freshIsLeadership = freshUser?.role && LEADERSHIP_ROLES.includes(freshUser.role);

      // If leadership role, show 2FA prompt
      if (freshIsLeadership && !freshUser?.twoFactorEnabled) {
        setShow2FAPrompt(true);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      const errors = err.response?.data?.errors;
      setError(Array.isArray(errors) ? errors.join('. ') : err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup2FA() {
    setSetting2FA(true);
    setTwoFAError('');
    try {
      const { data } = await api.post('/auth/2fa/setup');
      setQrCode(data.qrCode);
      setRecoveryCodes(data.recoveryCodes);
    } catch {
      setTwoFAError('Failed to setup 2FA');
    }
    setSetting2FA(false);
  }

  async function handleConfirm2FA() {
    setTwoFAError('');
    setSetting2FA(true);
    try {
      await api.post('/auth/2fa/confirm', { code: totpCode });
      await fetchUser();
      navigate('/');
    } catch {
      setTwoFAError('Invalid code. Please try again.');
    }
    setSetting2FA(false);
  }

  // 2FA Setup Prompt (after password change)
  if (show2FAPrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020202] p-4 grain-overlay">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-[1.5rem] mb-6 shadow-gold-lg" style={{ background: 'linear-gradient(135deg, #D9B061, #8A6D3B)' }}>
              <Smartphone className="w-9 h-9 text-[#020202]" />
            </div>
            <h1 className="text-2xl font-bold italic text-gradient-gold">Enable Two-Factor Authentication</h1>
            <p className="text-quantum-zinc mt-2 text-sm tracking-wide">
              As a member of the leadership team, we recommend enabling 2FA for additional security.
            </p>
          </div>

          <div className="card p-10">
            {!qrCode ? (
              <div className="space-y-5">
                {twoFAError && (
                  <div className="p-4 rounded-2xl text-sm" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#f87171' }}>{twoFAError}</div>
                )}

                <div className="p-4 rounded-2xl text-sm" style={{ background: 'rgba(217, 176, 97, 0.04)', border: '1px solid rgba(217, 176, 97, 0.1)', color: '#D9B061' }}>
                  Two-factor authentication adds an extra layer of security by requiring a code from your
                  authenticator app (Google Authenticator, Authy, etc.) when signing in.
                </div>

                <button
                  onClick={handleSetup2FA}
                  disabled={setting2FA}
                  className="btn-primary w-full py-3"
                >
                  {setting2FA ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <span className="flex items-center justify-center gap-2">
                      <Shield className="w-4 h-4" /> Set Up 2FA Now
                    </span>
                  )}
                </button>

                <button
                  onClick={() => navigate('/')}
                  className="w-full text-center text-sm text-quantum-zinc hover:text-primary-400 py-2 transition-colors tracking-wide"
                >
                  Skip for now <ArrowRight className="w-3 h-3 inline ml-1" />
                </button>
              </div>
            ) : !recoveryCodes.length ? (
              <div className="text-center py-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary-400 mx-auto" />
              </div>
            ) : (
              <div className="space-y-5">
                {twoFAError && (
                  <div className="p-4 rounded-2xl text-sm" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#f87171' }}>{twoFAError}</div>
                )}

                <div className="text-center">
                  <p className="text-sm text-gray-300 mb-3 tracking-wide">
                    Scan this QR code with your authenticator app:
                  </p>
                  <img src={qrCode} alt="2FA QR Code" className="mx-auto rounded-2xl" />
                </div>

                <div className="p-4 rounded-2xl" style={{ background: 'rgba(217, 176, 97, 0.04)', border: '1px solid rgba(217, 176, 97, 0.08)' }}>
                  <p className="label-luxury mb-2">Recovery Codes (save these!)</p>
                  <div className="grid grid-cols-2 gap-1">
                    {recoveryCodes.map((code, i) => (
                      <code key={i} className="text-xs text-primary-400 font-mono">{code}</code>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label-luxury mb-2 block">Verification Code</label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="input-field text-center text-xl tracking-[0.5em] font-light"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>

                <button
                  onClick={handleConfirm2FA}
                  disabled={setting2FA || totpCode.length < 6}
                  className="btn-primary w-full py-3"
                >
                  {setting2FA ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & Enable 2FA'}
                </button>

                <button
                  onClick={() => navigate('/')}
                  className="w-full text-center text-sm text-quantum-zinc hover:text-primary-400 py-2 transition-colors tracking-wide"
                >
                  Skip for now <ArrowRight className="w-3 h-3 inline ml-1" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020202] p-4 grain-overlay">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[1.5rem] mb-6 shadow-gold-lg" style={{ background: 'linear-gradient(135deg, #D9B061, #8A6D3B)' }}>
            <Lock className="w-9 h-9 text-[#020202]" />
          </div>
          <h1 className="text-2xl font-bold italic text-gradient-gold">
            {isFirstLogin ? 'Set Your New Password' : 'Change Password'}
          </h1>
          {isFirstLogin && (
            <p className="text-quantum-zinc mt-2 text-sm tracking-wide">
              For security, you must change your temporary password before continuing.
            </p>
          )}
        </div>

        <div className="card p-10">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 rounded-2xl text-sm" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                {error}
              </div>
            )}

            <div>
              <label className="label-luxury mb-2 block">
                {isFirstLogin ? 'Temporary Password' : 'Current Password'}
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-field pr-12"
                  placeholder={isFirstLogin ? 'Enter the password from your email' : 'Enter current password'}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-quantum-zinc hover:text-primary-400 transition-colors"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="label-luxury mb-2 block">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field pr-12"
                  placeholder="Create a strong password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-quantum-zinc hover:text-primary-400 transition-colors"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength indicators */}
              {newPassword.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {checks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Check className={`w-3 h-3 ${check.pass ? 'text-green-400' : 'text-quantum-zinc/30'}`} />
                      <span className={`tracking-wide ${check.pass ? 'text-green-400' : 'text-quantum-zinc/50'}`}>{check.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label-luxury mb-2 block">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="Repeat your new password"
                required
              />
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <p className="text-xs text-red-400 mt-1.5 tracking-wide">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !allPassed}
              className="btn-primary w-full py-3"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <span className="flex items-center justify-center gap-2">
                  <Shield className="w-4 h-4" /> Set New Password
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
