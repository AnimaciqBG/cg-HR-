import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, Sun, Moon, User } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import type { Notification } from '../../types';

export default function Header() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [dark, setDark] = useState(localStorage.getItem('theme') === 'dark');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/employees?search=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  }

  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6 sticky top-0 z-10">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center w-96 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
        {/* Theme toggle */}
        <button
          onClick={() => setDark(!dark)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 card shadow-lg max-h-96 overflow-hidden z-50">
              <div className="flex items-center justify-between p-3 border-b dark:border-gray-700">
                <h3 className="font-semibold text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary-600 hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="overflow-y-auto max-h-72">
                {notifications.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 text-center">No notifications</p>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className={`p-3 border-b dark:border-gray-700 text-sm ${!n.isRead ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                      <p className="font-medium">{n.title}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <div className="flex items-center gap-2 pl-2 border-l dark:border-gray-700">
          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
            <User className="w-4 h-4 text-primary-600" />
          </div>
          {user?.employee && (
            <span className="text-sm font-medium hidden md:block">
              {user.employee.firstName}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
