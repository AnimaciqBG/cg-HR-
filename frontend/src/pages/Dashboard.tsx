import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import type { DashboardData, Announcement } from '../types';
import {
  Users, CalendarDays, CheckSquare, Coffee,
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
          api.get('/reports/dashboard').catch(() => ({ data: null })),
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const stats = [
    { label: 'Total Employees', value: data?.totalEmployees || 0, icon: Users, gradient: 'linear-gradient(135deg, rgba(217, 176, 97, 0.12), rgba(138, 109, 59, 0.06))', link: '/employees' },
    { label: 'On Leave Today', value: data?.activeLeaves || 0, icon: CalendarDays, gradient: 'linear-gradient(135deg, rgba(251, 146, 60, 0.12), rgba(194, 65, 12, 0.06))', link: '/leaves' },
    { label: 'Pending Approvals', value: data?.pendingApprovals || 0, icon: CheckSquare, gradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(107, 33, 168, 0.06))', link: '/leaves' },
    { label: 'Breaks Today', value: data?.todayBreaks || 0, icon: Coffee, gradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(22, 101, 52, 0.06))', link: '/breaks' },
  ];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-10">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold italic text-gradient-gold">
          {greeting()}, {user?.employee?.firstName || 'User'}
        </h1>
        <p className="text-quantum-zinc mt-2 text-sm tracking-wider uppercase">
          Here's what's happening today
        </p>
      </div>

      {/* Bento Stats Grid — Asymmetric */}
      <div className="grid grid-cols-12 gap-5">
        {stats.map((stat, i) => (
          <Link
            key={stat.label}
            to={stat.link}
            className={`card p-7 micro-scale hover-glow ${i === 0 ? 'col-span-12 sm:col-span-7' : 'col-span-12 sm:col-span-5'} ${i === 2 ? 'sm:col-span-5' : i === 3 ? 'sm:col-span-7' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="label-luxury mb-2">{stat.label}</p>
                <p className="text-4xl font-bold text-white tracking-tight">{stat.value}</p>
              </div>
              <div className="p-4 rounded-2xl" style={{ background: stat.gradient }}>
                <stat.icon className="w-7 h-7 text-primary-400" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Bento Bottom Grid — Asymmetric (Quick Actions 5/12, Announcements 7/12) */}
      <div className="grid grid-cols-12 gap-5">
        {/* Quick Actions — Satellite card */}
        <div className="col-span-12 lg:col-span-5 card p-7">
          <h2 className="text-lg font-semibold text-white tracking-wide mb-5">Quick Actions</h2>
          <div className="gold-line mb-5" />
          <div className="space-y-2">
            {[
              { to: '/time', icon: Clock, label: 'Clock In / Out', color: 'text-primary-400' },
              { to: '/breaks', icon: Coffee, label: 'Start Break', color: 'text-green-400' },
              { to: '/leaves', icon: CalendarDays, label: 'Request Leave', color: 'text-orange-400' },
              { to: '/goals', icon: TrendingUp, label: 'My Goals', color: 'text-purple-400' },
            ].map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/[0.03] transition-all duration-300 group"
              >
                <action.icon className={`w-5 h-5 ${action.color}`} />
                <span className="text-sm font-medium text-gray-300 tracking-wide">{action.label}</span>
                <ArrowRight className="w-4 h-4 ml-auto text-quantum-zinc group-hover:text-primary-400 group-hover:translate-x-1 transition-all duration-300" />
              </Link>
            ))}
          </div>
        </div>

        {/* Announcements — Hero card */}
        <div className="col-span-12 lg:col-span-7 card p-7">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white tracking-wide">Announcements</h2>
            <Link to="/announcements" className="text-sm text-primary-400 hover:text-primary-300 transition-colors tracking-wide">View all</Link>
          </div>
          <div className="gold-line mb-5" />
          <div className="space-y-3">
            {announcements.length === 0 ? (
              <p className="text-sm text-quantum-zinc py-8 text-center tracking-wide">No announcements</p>
            ) : (
              announcements.map((ann) => (
                <div
                  key={ann.id}
                  className={`p-5 rounded-2xl transition-all duration-300 hover:bg-white/[0.02] ${ann.isPinned ? 'bg-primary-500/[0.04]' : ''}`}
                  style={{ border: ann.isPinned ? '1px solid rgba(217, 176, 97, 0.1)' : '1px solid rgba(217, 176, 97, 0.03)' }}
                >
                  <div className="flex items-start gap-3">
                    <Megaphone className={`w-4 h-4 mt-0.5 flex-shrink-0 ${ann.priority === 'high' || ann.priority === 'urgent' ? 'text-red-400' : 'text-quantum-zinc'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-white tracking-wide">{ann.title}</p>
                      <p className="text-xs text-quantum-zinc mt-1.5 line-clamp-2">{ann.content}</p>
                      <p className="text-xs text-quantum-zinc/50 mt-2 tracking-wider">
                        {new Date(ann.publishedAt).toLocaleDateString('bg-BG')}
                      </p>
                    </div>
                    {ann.isPinned && <span className="badge badge-yellow ml-auto">Pinned</span>}
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
