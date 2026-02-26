import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bell, Search, User, Camera, Clock } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import type { Notification } from '../../types';

export default function Header() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const notifRef = useRef<HTMLDivElement>(null);

  // Photo upload state
  const [uploading, setUploading] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const employeeId = user?.employee?.id;
  const photoUrl = (user?.employee as any)?.photoUrl || null;

  useEffect(() => {
    fetchNotifications();
    if (employeeId) checkPendingPhoto();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setShowAvatarMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function fetchNotifications() {
    try {
      const { data } = await api.get('/notifications?unreadOnly=true');
      setNotifications(data.data || []);
      setUnreadCount(data.unreadCount || 0);
    } catch { /* ignore */ }
  }

  async function markAllRead() {
    try {
      await api.post('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch { /* ignore */ }
  }

  async function checkPendingPhoto() {
    if (!employeeId) return;
    try {
      const { data } = await api.get(`/photos/history/${employeeId}`);
      const photos = data.data || [];
      setHasPending(photos.some((p: any) => p.status === 'PENDING'));
    } catch { /* ignore */ }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !employeeId) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Only JPEG, PNG, and WebP are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File must be under 5MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      await api.post(`/photos/upload/${employeeId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setHasPending(true);
      setShowAvatarMenu(false);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to upload photo');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/employees?search=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  }

  return (
    <header className="h-20 glass flex items-center justify-between px-8 sticky top-0 z-10">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center w-96 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-quantum-zinc" />
          <input
            type="text"
            placeholder="Search employees, documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-11 py-2.5"
          />
        </div>
      </form>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2.5 rounded-2xl hover:bg-white/[0.03] relative text-quantum-zinc transition-all duration-300"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-[#020202]" style={{ background: 'linear-gradient(135deg, #D9B061, #8A6D3B)' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-14 w-80 card shadow-gold-lg max-h-96 overflow-hidden z-50">
              <div className="flex items-center justify-between p-4">
                <h3 className="font-semibold text-sm text-white tracking-wide">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="gold-line" />
              <div className="overflow-y-auto max-h-72">
                {notifications.length === 0 ? (
                  <p className="p-6 text-sm text-quantum-zinc text-center">No notifications</p>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className={`p-4 text-sm transition-colors ${!n.isRead ? 'bg-primary-500/[0.04]' : ''}`} style={{ borderBottom: '1px solid rgba(217, 176, 97, 0.04)' }}>
                      <p className="font-medium text-white">{n.title}</p>
                      <p className="text-quantum-zinc text-xs mt-1">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-8" style={{ background: 'linear-gradient(to bottom, transparent, rgba(217, 176, 97, 0.15), transparent)' }} />

        {/* User avatar with photo upload */}
        <div className="relative flex items-center gap-3" ref={avatarRef}>
          <button
            onClick={() => setShowAvatarMenu(!showAvatarMenu)}
            className="relative group"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:shadow-gold" style={{ background: 'rgba(217, 176, 97, 0.08)', border: '1px solid rgba(217, 176, 97, 0.12)' }}>
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-10 h-10 rounded-2xl object-cover" />
              ) : (
                <User className="w-4 h-4 text-primary-500" />
              )}
            </div>
            {hasPending && (
              <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #D9B061, #8A6D3B)' }}>
                <Clock className="w-2 h-2 text-[#020202]" />
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-2xl bg-[#020202]/60 flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500"></div>
              </div>
            )}
          </button>
          {user?.employee && (
            <span className="text-sm font-medium text-gray-300 hidden md:block tracking-wide">
              {user.employee.firstName}
            </span>
          )}

          {/* Avatar dropdown menu */}
          {showAvatarMenu && (
            <div className="absolute right-0 top-14 w-60 card shadow-gold-lg z-50 overflow-hidden">
              {/* User info */}
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden" style={{ background: 'rgba(217, 176, 97, 0.08)', border: '1px solid rgba(217, 176, 97, 0.12)' }}>
                    {photoUrl ? (
                      <img src={photoUrl} alt="" className="w-11 h-11 rounded-2xl object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-primary-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user?.email}
                    </p>
                    <p className="text-xs text-quantum-zinc truncate">{user?.email}</p>
                  </div>
                </div>
              </div>

              <div className="gold-line" />

              {/* Actions */}
              <div className="p-2">
                {employeeId && (
                  <Link
                    to={`/employees/${employeeId}`}
                    onClick={() => setShowAvatarMenu(false)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-white/[0.03] rounded-xl transition-all duration-300"
                  >
                    <User className="w-4 h-4" /> <span className="tracking-wide">View Profile</span>
                  </Link>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-white/[0.03] rounded-xl disabled:opacity-50 transition-all duration-300"
                >
                  <Camera className="w-4 h-4" /> <span className="tracking-wide">Change Photo</span>
                  {hasPending && <span className="ml-auto text-xs text-primary-500 tracking-wider uppercase">pending</span>}
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
