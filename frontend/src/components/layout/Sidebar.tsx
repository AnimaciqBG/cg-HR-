import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  LayoutDashboard, Users, Calendar, Clock, Coffee, CalendarDays,
  FileText, Award, Target, GraduationCap, Megaphone, BarChart3,
  Settings, Film, LogOut, ChevronLeft, Menu, Camera
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
    <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-black border-r border-gray-800 flex flex-col h-screen sticky top-0 transition-all duration-200`}>
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-800">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Film className="w-8 h-8 text-primary-500" />
            <span className="font-bold text-lg text-primary-400">CG HR</span>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400">
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-1">
          {filteredNav.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-900/40 text-primary-400 border border-primary-800/50'
                      : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                  }`
                }
                title={collapsed ? item.name : undefined}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-gray-800">
        {!collapsed && user?.employee && (
          <div className="mb-2 px-2">
            <p className="text-sm font-medium text-white truncate">
              {user.employee.firstName} {user.employee.lastName}
            </p>
            <p className="text-xs text-primary-500 truncate">{ROLE_LABELS[user.role] || user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
