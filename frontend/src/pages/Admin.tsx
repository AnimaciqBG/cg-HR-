import { useEffect, useState } from 'react';
import api from '../services/api';
import type { LicenseStatus, AuditLog, PaginatedResponse } from '../types';
import { ROLE_LABELS } from '../types';
import {
  Settings, Users, MapPin, Shield, ScrollText,
  Key, AlertCircle, Lock
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Admin() {
  const { user, hasMinRole } = useAuthStore();
  const [activeTab, setActiveTab] = useState('license');
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
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

  if (!hasMinRole('ADMIN')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Lock className="w-12 h-12 mb-3 text-gray-600" />
        <p className="text-lg font-medium text-white">Access Restricted</p>
        <p className="text-sm text-gray-400">Administration is only available to managers.</p>
      </div>
    );
  }

  const tabs = [
    { key: 'license', label: 'License & Limits', icon: Key },
    { key: 'locations', label: 'Locations', icon: MapPin },
    { key: 'settings', label: 'System Settings', icon: Settings },
    { key: 'audit', label: 'Audit Logs', icon: ScrollText },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Administration</h1>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${activeTab === t.key ? 'bg-primary-900/40 text-primary-400' : 'bg-gray-800 text-gray-400'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
      ) : (
        <>
          {/* License */}
          {activeTab === 'license' && license && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-6 text-center">
                  <Users className="w-8 h-8 mx-auto text-primary-400 mb-2" />
                  <p className="text-3xl font-bold text-white">{license.activeUsers} / {license.maxUsers}</p>
                  <p className="text-sm text-gray-400 mt-1">Active Users</p>
                  {!license.canAddUser && <p className="text-xs text-red-400 mt-2 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3" /> Limit reached</p>}
                  <div className="w-full bg-gray-800 rounded-full h-2 mt-3">
                    <div className={`h-2 rounded-full ${license.canAddUser ? 'bg-primary-500' : 'bg-red-500'}`} style={{ width: `${(license.activeUsers / license.maxUsers) * 100}%` }}></div>
                  </div>
                </div>
                <div className="card p-6 text-center">
                  <Shield className="w-8 h-8 mx-auto text-purple-400 mb-2" />
                  <p className="text-3xl font-bold text-white">{license.activeAdmins} / {license.maxAdmins}</p>
                  <p className="text-sm text-gray-400 mt-1">Admins</p>
                </div>
                <div className="card p-6 text-center">
                  <Key className="w-8 h-8 mx-auto text-red-400 mb-2" />
                  <p className="text-3xl font-bold text-white">{license.activeSuperAdmins} / {license.maxSuperAdmins}</p>
                  <p className="text-sm text-gray-400 mt-1">Main Managers</p>
                </div>
              </div>

              {/* Role Hierarchy */}
              <div className="card p-6">
                <h3 className="font-semibold mb-3 text-white">Cinema Role Structure</h3>
                <div className="space-y-2">
                  {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <div key={role} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50">
                      <span className="text-sm text-gray-300">{label}</span>
                      <span className="text-xs text-gray-500 font-mono">{role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Locations */}
          {activeTab === 'locations' && (
            <div className="card p-6">
              <div className="space-y-2">
                {locations.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
                    <div>
                      <p className="font-medium text-white">{l.name}</p>
                      <p className="text-xs text-gray-500">{l.address}, {l.city}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${l.isActive ? 'badge-green' : 'badge-gray'}`}>{l.isActive ? 'Active' : 'Inactive'}</span>
                      <span className="badge badge-blue">{l._count?.employees || 0} emp.</span>
                    </div>
                  </div>
                ))}
                {locations.length === 0 && <p className="text-gray-500 text-center py-4">No locations configured</p>}
              </div>
            </div>
          )}

          {/* Settings */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {Object.entries(settings).map(([group, items]) => (
                <div key={group} className="card p-6">
                  <h3 className="font-semibold capitalize mb-3 text-white">{group}</h3>
                  <div className="space-y-2">
                    {items.map((s: any) => (
                      <div key={s.key} className="flex items-center justify-between p-2 text-sm">
                        <div>
                          <p className="font-medium text-gray-300">{s.key}</p>
                          {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
                        </div>
                        <span className="font-mono bg-gray-800 px-2 py-1 rounded text-primary-400">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(settings).length === 0 && <p className="text-gray-500 text-center py-4">No settings configured</p>}
            </div>
          )}

          {/* Audit Logs */}
          {activeTab === 'audit' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Time</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Actor</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Action</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Object</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-800/30">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">{new Date(log.createdAt).toLocaleString('bg-BG')}</td>
                        <td className="px-4 py-3 text-gray-300">{log.actor?.email || 'System'}</td>
                        <td className="px-4 py-3"><span className="badge badge-gray">{log.action}</span></td>
                        <td className="px-4 py-3 text-xs text-gray-400">{log.objectType} {log.objectId?.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">{log.ipAddress}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {auditLogs.length === 0 && <p className="text-gray-500 text-center py-8">No audit logs</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
