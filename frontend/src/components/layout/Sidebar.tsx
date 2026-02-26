import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  LayoutDashboard, Users, Calendar, Clock, Coffee, CalendarDays,
  FileText, Award, Target, GraduationCap, Megaphone, BarChart3,
  Settings, Film, LogOut, ChevronLeft, Menu, Camera, ClipboardList, Eye, Trophy, MessageSquare
} from 'lucide-react';
import { useState } from 'react';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Main Manager',
  ADMIN: 'Deputy Manager',
  HR: 'Administrator',
  PAYROLL_ADMIN: 'Senior Team Lead',
  TEAM_LEAD: 'Team Leader',
  EMPLOYEE: 'Employee',
};

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Employees', href: '/employees', icon: Users, roles: ['TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Schedule', href: '/schedule', icon: Calendar, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Time & Attendance', href: '/time', icon: Clock, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Breaks', href: '/breaks', icon: Coffee, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Leaves', href: '/leaves', icon: CalendarDays, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Documents', href: '/documents', icon: FileText, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Performance', href: '/performance', icon: Award, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Goals', href: '/goals', icon: Target, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Training', href: '/training', icon: GraduationCap, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Tasks', href: '/tasks', icon: ClipboardList, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Task Review', href: '/task-review', icon: Eye, roles: ['TEAM_LEAD', 'HR', 'ADMIN', 'SUPER_ADMIN'] },
  { name: 'Leaderboard', href: '/leaderboard', icon: Trophy, roles: ['TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Messages', href: '/messages', icon: MessageSquare, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Announcements', href: '/announcements', icon: Megaphone, roles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Photo Review', href: '/photo-review', icon: Camera, roles: ['TEAM_LEAD', 'HR', 'ADMIN', 'SUPER_ADMIN'] },
  { name: 'Reports', href: '/reports', icon: BarChart3, roles: ['HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'] },
  { name: 'Admin', href: '/admin', icon: Settings, roles: ['ADMIN', 'SUPER_ADMIN'] },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  const filteredNav = navigation.filter(item =>
    user?.role && item.roles.includes(user.role)
  );

  return (
    <aside className={`${collapsed ? 'w-20' : 'w-72'} glass flex flex-col h-screen sticky top-0 transition-all duration-500 ease-out z-10`}>
      {/* Header */}
      <div className="h-20 flex items-center justify-between px-5">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #D9B061, #8A6D3B)' }}>
              <Film className="w-5 h-5 text-[#020202]" />
            </div>
            <div>
              <span className="font-bold text-lg text-gradient-gold tracking-wide">CG HR</span>
              <p className="text-[10px] uppercase tracking-[0.25em] text-quantum-zinc">Platform</p>
            </div>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="p-2 rounded-xl hover:bg-white/5 text-quantum-zinc transition-all duration-300">
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Gold separator */}
      <div className="gold-line mx-4" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-3">
        <ul className="space-y-1">
          {filteredNav.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all duration-300 ${
                    isActive
                      ? 'bg-primary-500/10 text-primary-400 shadow-gold'
                      : 'text-quantum-zinc hover:bg-white/[0.03] hover:text-gray-200'
                  }`
                }
                title={collapsed ? item.name : undefined}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="tracking-wide">{item.name}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Gold separator */}
      <div className="gold-line mx-4" />

      {/* User section */}
      <div className="p-4">
        {!collapsed && user?.employee && (
          <div className="mb-3 px-3">
            <p className="text-sm font-medium text-white truncate">
              {user.employee.firstName} {user.employee.lastName}
            </p>
            <p className="text-xs text-primary-500 truncate tracking-wider uppercase">{ROLE_LABELS[user.role] || user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/5 rounded-2xl transition-all duration-300"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="tracking-wide">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
