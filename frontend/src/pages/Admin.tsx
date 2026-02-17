import { useEffect, useState } from 'react';
import api from '../services/api';
import type { LicenseStatus, AuditLog, PaginatedResponse } from '../types';
import {
  Settings, Users, Building2, MapPin, Shield, ScrollText,
  Database, Key, ChevronDown, ChevronRight, AlertCircle
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function Admin() {
  const { user, hasMinRole } = useAuthStore();
  const [activeTab, setActiveTab] = useState('license');
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchTabData(); }, [activeTab]);

  async function fetchTabData() {
    setLoading(true);
    try {
      if (activeTab === 'license') {
        const { data } = await api.get('/admin/license');
        setLicense(data);
      } else if (activeTab === 'audit') {
        const { data } = await api.get<PaginatedResponse<AuditLog>>('/admin/audit-logs?limit=50');
        setAuditLogs(data.data || []);
      } else if (activeTab === 'departments') {
        const { data } = await api.get('/admin/departments');
        setDepartments(data);
      } else if (activeTab === 'locations') {
        const { data } = await api.get('/admin/locations');
        setLocations(data);
      } else if (activeTab === 'settings') {
        const { data } = await api.get('/admin/settings');
        setSettings(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  const tabs = [
    { key: 'license', label: 'License & Limits', icon: Key },
    { key: 'departments', label: 'Departments', icon: Building2 },
    { key: 'locations', label: 'Locations', icon: MapPin },
    { key: 'settings', label: 'System Settings', icon: Settings },
    { key: 'audit', label: 'Audit Logs', icon: ScrollText },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Administration</h1>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${activeTab === t.key ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : (
        <>
          {/* License */}
          {activeTab === 'license' && license && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-6 text-center">
                  <Users className="w-8 h-8 mx-auto text-blue-600 mb-2" />
                  <p className="text-3xl font-bold">{license.activeUsers} / {license.maxUsers}</p>
                  <p className="text-sm text-gray-500 mt-1">Active Users</p>
                  {!license.canAddUser && <p className="text-xs text-red-500 mt-2 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3" /> Limit reached</p>}
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                    <div className={`h-2 rounded-full ${license.canAddUser ? 'bg-blue-600' : 'bg-red-500'}`} style={{ width: `${(license.activeUsers / license.maxUsers) * 100}%` }}></div>
                  </div>
                </div>
                <div className="card p-6 text-center">
                  <Shield className="w-8 h-8 mx-auto text-purple-600 mb-2" />
                  <p className="text-3xl font-bold">{license.activeAdmins} / {license.maxAdmins}</p>
                  <p className="text-sm text-gray-500 mt-1">Admins</p>
                </div>
                <div className="card p-6 text-center">
                  <Key className="w-8 h-8 mx-auto text-red-600 mb-2" />
                  <p className="text-3xl font-bold">{license.activeSuperAdmins} / {license.maxSuperAdmins}</p>
                  <p className="text-sm text-gray-500 mt-1">Super Admins</p>
                </div>
              </div>
              {user?.role === 'SUPER_ADMIN' && (
                <p className="text-sm text-gray-500">Only Super Admin can modify license limits via API.</p>
              )}
            </div>
          )}

          {/* Departments */}
          {activeTab === 'departments' && (
            <div className="card p-6">
              <div className="space-y-2">
                {departments.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-gray-500">{d.code} {d.description ? `- ${d.description}` : ''}</p>
                    </div>
                    <span className="badge badge-blue">{d._count?.employees || 0} employees</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Locations */}
          {activeTab === 'locations' && (
            <div className="card p-6">
              <div className="space-y-2">
                {locations.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <div>
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-gray-500">{l.address}, {l.city}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${l.isActive ? 'badge-green' : 'badge-gray'}`}>{l.isActive ? 'Active' : 'Inactive'}</span>
                      <span className="badge badge-blue">{l._count?.employees || 0} emp.</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {Object.entries(settings).map(([group, items]) => (
                <div key={group} className="card p-6">
                  <h3 className="font-semibold capitalize mb-3">{group}</h3>
                  <div className="space-y-2">
                    {items.map((s: any) => (
                      <div key={s.key} className="flex items-center justify-between p-2 text-sm">
                        <div>
                          <p className="font-medium">{s.key}</p>
                          {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
                        </div>
                        <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Audit Logs */}
          {activeTab === 'audit' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Time</th>
                      <th className="px-4 py-3 text-left font-medium">Actor</th>
                      <th className="px-4 py-3 text-left font-medium">Action</th>
                      <th className="px-4 py-3 text-left font-medium">Object</th>
                      <th className="px-4 py-3 text-left font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{new Date(log.createdAt).toLocaleString('bg-BG')}</td>
                        <td className="px-4 py-3">{log.actor?.email || 'System'}</td>
                        <td className="px-4 py-3"><span className="badge badge-gray">{log.action}</span></td>
                        <td className="px-4 py-3 text-xs">{log.objectType} {log.objectId?.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-xs font-mono">{log.ipAddress}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
