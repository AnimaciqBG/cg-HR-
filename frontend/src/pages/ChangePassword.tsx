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
      <div className="min-h-screen flex items-center justify-center bg-black p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Enable Two-Factor Authentication</h1>
            <p className="text-gray-400 mt-2 text-sm">
              As a member of the leadership team, we recommend enabling 2FA for additional security.
            </p>
          </div>

          <div className="card p-8">
            {!qrCode ? (
              <div className="space-y-4">
                {twoFAError && (
                  <div className="p-3 rounded-lg bg-red-900/30 text-red-400 text-sm">{twoFAError}</div>
                )}

                <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-800/50">
                  <p className="text-sm text-blue-300">
                    Two-factor authentication adds an extra layer of security by requiring a code from your
                    authenticator app (Google Authenticator, Authy, etc.) when signing in.
                  </p>
                </div>

                <button
                  onClick={handleSetup2FA}
                  disabled={setting2FA}
                  className="btn-primary w-full py-2.5"
                >
                  {setting2FA ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <span className="flex items-center justify-center gap-2">
                      <Shield className="w-4 h-4" /> Set Up 2FA Now
                    </span>
                  )}
                </button>

                <button
                  onClick={() => navigate('/')}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-300 py-2"
                >
                  Skip for now <ArrowRight className="w-3 h-3 inline ml-1" />
                </button>
              </div>
            ) : !recoveryCodes.length ? (
              <div className="text-center py-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary-400 mx-auto" />
              </div>
            ) : (
              <div className="space-y-4">
                {twoFAError && (
                  <div className="p-3 rounded-lg bg-red-900/30 text-red-400 text-sm">{twoFAError}</div>
                )}

                <div className="text-center">
                  <p className="text-sm text-gray-300 mb-3">
                    Scan this QR code with your authenticator app:
                  </p>
                  <img src={qrCode} alt="2FA QR Code" className="mx-auto rounded-lg" />
                </div>

                <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-2 font-medium">Recovery Codes (save these!):</p>
                  <div className="grid grid-cols-2 gap-1">
                    {recoveryCodes.map((code, i) => (
                      <code key={i} className="text-xs text-yellow-400 font-mono">{code}</code>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Verification Code</label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="input-field text-center text-xl tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>

                <button
                  onClick={handleConfirm2FA}
                  disabled={setting2FA || totpCode.length < 6}
                  className="btn-primary w-full py-2.5 disabled:opacity-50"
                >
                  {setting2FA ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & Enable 2FA'}
                </button>

                <button
                  onClick={() => navigate('/')}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-300 py-2"
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
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-600 mb-4">
            <Lock className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            {isFirstLogin ? 'Set Your New Password' : 'Change Password'}
          </h1>
          {isFirstLogin && (
            <p className="text-gray-400 mt-2 text-sm">
              For security, you must change your temporary password before continuing.
            </p>
          )}
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-900/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {isFirstLogin ? 'Temporary Password' : 'Current Password'}
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder={isFirstLogin ? 'Enter the password from your email' : 'Enter current password'}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Create a strong password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength indicators */}
              {newPassword.length > 0 && (
                <div className="mt-2 space-y-1">
                  {checks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Check className={`w-3 h-3 ${check.pass ? 'text-green-400' : 'text-gray-600'}`} />
                      <span className={check.pass ? 'text-green-400' : 'text-gray-500'}>{check.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="Repeat your new password"
                required
              />
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !allPassed}
              className="btn-primary w-full py-2.5 disabled:opacity-50"
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
