import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import type { DashboardData, Announcement } from '../types';
import {
  Users, CalendarDays, CheckSquare, Coffee, Bell,
  ArrowRight, Megaphone, Clock, TrendingUp
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [dashRes, annRes] = await Promise.all([
          api.get('/reports/dashboard'),
          api.get('/announcements?limit=5'),
        ]);
        setData(dashRes.data);
        setAnnouncements(annRes.data.data || []);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const stats = [
    { label: 'Total Employees', value: data?.totalEmployees || 0, icon: Users, color: 'text-blue-600 bg-blue-100', link: '/employees' },
    { label: 'On Leave Today', value: data?.activeLeaves || 0, icon: CalendarDays, color: 'text-orange-600 bg-orange-100', link: '/leaves' },
    { label: 'Pending Approvals', value: data?.pendingApprovals || 0, icon: CheckSquare, color: 'text-purple-600 bg-purple-100', link: '/leaves' },
    { label: 'Breaks Today', value: data?.todayBreaks || 0, icon: Coffee, color: 'text-green-600 bg-green-100', link: '/breaks' },
  ];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {greeting()}, {user?.employee?.firstName || 'User'}!
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Here's what's happening today
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.link} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="card p-5">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link to="/time" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <Clock className="w-5 h-5 text-primary-600" />
              <span className="text-sm font-medium">Clock In / Out</span>
              <ArrowRight className="w-4 h-4 ml-auto text-gray-400" />
            </Link>
            <Link to="/breaks" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <Coffee className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium">Start Break</span>
              <ArrowRight className="w-4 h-4 ml-auto text-gray-400" />
            </Link>
            <Link to="/leaves" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <CalendarDays className="w-5 h-5 text-orange-600" />
              <span className="text-sm font-medium">Request Leave</span>
              <ArrowRight className="w-4 h-4 ml-auto text-gray-400" />
            </Link>
            <Link to="/goals" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium">My Goals</span>
              <ArrowRight className="w-4 h-4 ml-auto text-gray-400" />
            </Link>
          </div>
        </div>

        {/* Announcements */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Announcements</h2>
            <Link to="/announcements" className="text-sm text-primary-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-3">
            {announcements.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No announcements</p>
            ) : (
              announcements.map((ann) => (
                <div key={ann.id} className={`p-3 rounded-lg border ${ann.isPinned ? 'border-primary-200 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-800' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="flex items-start gap-2">
                    <Megaphone className={`w-4 h-4 mt-0.5 flex-shrink-0 ${ann.priority === 'high' || ann.priority === 'urgent' ? 'text-red-500' : 'text-gray-400'}`} />
                    <div>
                      <p className="font-medium text-sm">{ann.title}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ann.content}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(ann.publishedAt).toLocaleDateString('bg-BG')}
                      </p>
                    </div>
                    {ann.isPinned && <span className="badge badge-blue ml-auto">Pinned</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
