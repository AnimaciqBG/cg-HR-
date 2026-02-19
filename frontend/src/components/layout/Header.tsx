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
    <header className="h-16 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-6 sticky top-0 z-10">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center w-96 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search employees, documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10 py-2"
          />
        </div>
      </form>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg hover:bg-gray-800 relative text-gray-400"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 text-black text-xs rounded-full flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 card shadow-lg max-h-96 overflow-hidden z-50">
              <div className="flex items-center justify-between p-3 border-b border-gray-800">
                <h3 className="font-semibold text-sm text-white">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary-400 hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="overflow-y-auto max-h-72">
                {notifications.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 text-center">No notifications</p>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className={`p-3 border-b border-gray-800 text-sm ${!n.isRead ? 'bg-primary-900/20' : ''}`}>
                      <p className="font-medium text-white">{n.title}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar with photo upload */}
        <div className="relative flex items-center gap-2 pl-2 border-l border-gray-800" ref={avatarRef}>
          <button
            onClick={() => setShowAvatarMenu(!showAvatarMenu)}
            className="relative group"
          >
            <div className="w-9 h-9 rounded-full bg-primary-900/50 border-2 border-primary-700/50 flex items-center justify-center overflow-hidden hover:border-primary-500 transition-colors">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-primary-400" />
              )}
            </div>
            {hasPending && (
              <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-yellow-500 rounded-full flex items-center justify-center">
                <Clock className="w-2 h-2 text-black" />
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              </div>
            )}
          </button>
          {user?.employee && (
            <span className="text-sm font-medium text-gray-300 hidden md:block">
              {user.employee.firstName}
            </span>
          )}

          {/* Avatar dropdown menu */}
          {showAvatarMenu && (
            <div className="absolute right-0 top-12 w-56 card shadow-lg z-50 overflow-hidden">
              {/* User info */}
              <div className="p-3 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary-900/50 flex items-center justify-center overflow-hidden">
                    {photoUrl ? (
                      <img src={photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-primary-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user?.email}
                    </p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-1">
                {employeeId && (
                  <Link
                    to={`/employees/${employeeId}`}
                    onClick={() => setShowAvatarMenu(false)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg"
                  >
                    <User className="w-4 h-4" /> View Profile
                  </Link>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" /> Change Photo
                  {hasPending && <span className="ml-auto text-xs text-yellow-400">pending</span>}
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
