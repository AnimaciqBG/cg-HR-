import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import type { LicenseStatus, AuditLog, PaginatedResponse, PermissionMatrixEntry } from '../types';
import { ROLE_LABELS } from '../types';
import {
  Settings, Users, MapPin, Shield, ScrollText,
  Key, AlertCircle, Lock, Check, X, Minus, Save, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

type OverrideState = 'role' | 'granted' | 'denied';

export default function Admin() {
  const { user, hasMinRole } = useAuthStore();
  const [activeTab, setActiveTab] = useState('license');
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  // Permission Matrix state
  const [matrixData, setMatrixData] = useState<PermissionMatrixEntry[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [editOverrides, setEditOverrides] = useState<Record<string, OverrideState>>({});
  const [saving, setSaving] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
      } else if (activeTab === 'permissions') {
        const { data } = await api.get('/admin/permissions/matrix');
        setMatrixData(data.matrix || []);
        setAllPermissions(data.allPermissions || []);
        setCategories(data.categories || {});
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  const selectUserForEdit = useCallback((userId: string) => {
    const entry = matrixData.find(m => m.user.id === userId);
    if (!entry) return;

    setSelectedUser(userId);
    // Build override state: for each permission, determine if it's role-default, granted override, or denied override
    const state: Record<string, OverrideState> = {};
    for (const perm of allPermissions) {
      if (perm in entry.overrides) {
        state[perm] = entry.overrides[perm] ? 'granted' : 'denied';
      } else {
        state[perm] = 'role';
      }
    }
    setEditOverrides(state);
    setExpandedCategories(new Set(Object.keys(categories)));
  }, [matrixData, allPermissions, categories]);

  const togglePermission = (perm: string) => {
    const entry = matrixData.find(m => m.user.id === selectedUser);
    if (!entry) return;

    const current = editOverrides[perm] || 'role';
    const hasRoleDefault = entry.rolePermissions.includes(perm);

    // Cycle: role -> granted -> denied -> role
    let next: OverrideState;
    if (current === 'role') {
      next = hasRoleDefault ? 'denied' : 'granted';
    } else if (current === 'granted') {
      next = 'denied';
    } else {
      next = 'role';
    }

    setEditOverrides(prev => ({ ...prev, [perm]: next }));
  };

  const saveOverrides = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const overrides: { permission: string; granted: boolean }[] = [];
      for (const [perm, state] of Object.entries(editOverrides)) {
        if (state === 'granted') {
          overrides.push({ permission: perm, granted: true });
        } else if (state === 'denied') {
          overrides.push({ permission: perm, granted: false });
        }
        // 'role' = no override, don't include
      }

      await api.put(`/admin/permissions/user/${selectedUser}`, { overrides });

      // Refresh matrix
      const { data } = await api.get('/admin/permissions/matrix');
      setMatrixData(data.matrix || []);
      setSelectedUser(null);
    } catch {
      alert('Failed to save permissions');
    }
    setSaving(false);
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (!hasMinRole('ADMIN')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Lock className="w-12 h-12 mb-3 text-gray-600" />
        <p className="text-lg font-medium text-white">Access Restricted</p>
        <p className="text-sm text-quantum-zinc">Administration is only available to managers.</p>
      </div>
    );
  }

  const tabs = [
    { key: 'license', label: 'License & Limits', icon: Key },
    { key: 'locations', label: 'Locations', icon: MapPin },
    { key: 'settings', label: 'System Settings', icon: Settings },
    { key: 'permissions', label: 'Permissions', icon: Shield },
    { key: 'audit', label: 'Audit Logs', icon: ScrollText },
  ];

  const getPermLabel = (perm: string) => {
    const parts = perm.split(':');
    return parts[1]?.replace(/_/g, ' ') || perm;
  };

  const selectedEntry = matrixData.find(m => m.user.id === selectedUser);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold italic text-gradient-gold">Administration</h1>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${activeTab === t.key ? 'bg-primary-500/10 text-primary-400' : 'bg-white/[0.03] text-quantum-zinc'}`}>
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
                  <p className="text-sm text-quantum-zinc mt-1">Active Users</p>
                  {!license.canAddUser && <p className="text-xs text-red-400 mt-2 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3" /> Limit reached</p>}
                  <div className="w-full bg-white/[0.03] rounded-full h-2 mt-3">
                    <div className={`h-2 rounded-full ${license.canAddUser ? 'bg-primary-500' : 'bg-red-500'}`} style={{ width: `${(license.activeUsers / license.maxUsers) * 100}%` }}></div>
                  </div>
                </div>
                <div className="card p-6 text-center">
                  <Shield className="w-8 h-8 mx-auto text-purple-400 mb-2" />
                  <p className="text-3xl font-bold text-white">{license.activeAdmins} / {license.maxAdmins}</p>
                  <p className="text-sm text-quantum-zinc mt-1">Admins</p>
                </div>
                <div className="card p-6 text-center">
                  <Key className="w-8 h-8 mx-auto text-red-400 mb-2" />
                  <p className="text-3xl font-bold text-white">{license.activeSuperAdmins} / {license.maxSuperAdmins}</p>
                  <p className="text-sm text-quantum-zinc mt-1">Main Managers</p>
                </div>
              </div>

              {/* Role Hierarchy */}
              <div className="card p-6">
                <h3 className="font-semibold mb-3 tracking-wide text-white">Cinema Role Structure</h3>
                <div className="space-y-2">
                  {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <div key={role} className="flex items-center justify-between p-2 rounded-2xl bg-white/[0.03]">
                      <span className="text-sm text-gray-300">{label}</span>
                      <span className="text-xs text-quantum-zinc font-mono">{role}</span>
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
                  <div key={l.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03]">
                    <div>
                      <p className="font-medium text-white">{l.name}</p>
                      <p className="text-xs text-quantum-zinc">{l.address}, {l.city}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${l.isActive ? 'badge-green' : 'badge-gray'}`}>{l.isActive ? 'Active' : 'Inactive'}</span>
                      <span className="badge badge-blue">{l._count?.employees || 0} emp.</span>
                    </div>
                  </div>
                ))}
                {locations.length === 0 && <p className="text-quantum-zinc text-center py-4">No locations configured</p>}
              </div>
            </div>
          )}

          {/* Settings */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {Object.entries(settings).map(([group, items]) => (
                <div key={group} className="card p-6">
                  <h3 className="font-semibold capitalize mb-3 tracking-wide text-white">{group}</h3>
                  <div className="space-y-2">
                    {items.map((s: any) => (
                      <div key={s.key} className="flex items-center justify-between p-2 text-sm">
                        <div>
                          <p className="font-medium text-gray-300">{s.key}</p>
                          {s.description && <p className="text-xs text-quantum-zinc">{s.description}</p>}
                        </div>
                        <span className="font-mono bg-white/[0.03] px-2 py-1 rounded text-primary-400">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(settings).length === 0 && <p className="text-quantum-zinc text-center py-4">No settings configured</p>}
            </div>
          )}

          {/* Permissions Matrix */}
          {activeTab === 'permissions' && (
            <div className="space-y-4">
              {!selectedUser ? (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">User Permissions</h2>
                    <button onClick={() => fetchTabData()} className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/[0.03] text-quantum-zinc hover:text-white text-sm">
                      <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                  </div>

                  <p className="text-sm text-quantum-zinc">Select a user to view and modify their permissions. Overrides allow granting or denying specific permissions beyond their role defaults.</p>

                  <div className="space-y-2">
                    {matrixData.map((entry) => {
                      const overrideCount = Object.keys(entry.overrides).length;
                      return (
                        <div key={entry.user.id}
                          onClick={() => selectUserForEdit(entry.user.id)}
                          className="card p-4 cursor-pointer hover:border-primary-500/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary-500/10 flex items-center justify-center">
                                <span className="text-primary-400 font-semibold text-sm">
                                  {entry.user.employee ? `${entry.user.employee.firstName[0]}${entry.user.employee.lastName[0]}` : entry.user.email[0].toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-white">
                                  {entry.user.employee ? `${entry.user.employee.firstName} ${entry.user.employee.lastName}` : entry.user.email}
                                </p>
                                <p className="text-xs text-quantum-zinc">
                                  {ROLE_LABELS[entry.user.role as keyof typeof ROLE_LABELS] || entry.user.role}
                                  {entry.user.employee?.jobTitle && ` - ${entry.user.employee.jobTitle}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-quantum-zinc">
                                {entry.effectivePermissions.length} permissions
                              </span>
                              {overrideCount > 0 && (
                                <span className="badge bg-primary-500/10 text-primary-400 text-xs">
                                  {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  {/* Permission Editor for selected user */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSelectedUser(null)} className="px-3 py-1.5 rounded-2xl bg-white/[0.03] text-quantum-zinc hover:text-white text-sm">
                        Back
                      </button>
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          {selectedEntry?.user.employee ? `${selectedEntry.user.employee.firstName} ${selectedEntry.user.employee.lastName}` : selectedEntry?.user.email}
                        </h2>
                        <p className="text-xs text-quantum-zinc">
                          Role: {ROLE_LABELS[selectedEntry?.user.role as keyof typeof ROLE_LABELS] || selectedEntry?.user.role}
                        </p>
                      </div>
                    </div>
                    <button onClick={saveOverrides} disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-black font-medium hover:bg-primary-500 disabled:opacity-50 text-sm">
                      <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>

                  <div className="flex gap-4 text-xs text-quantum-zinc">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700 inline-block"></span> Role Default</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-900 inline-block"></span> Granted Override</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-900 inline-block"></span> Denied Override</span>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(categories).map(([category, perms]) => (
                      <div key={category} className="card overflow-hidden">
                        <button onClick={() => toggleCategory(category)}
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02]">
                          <h3 className="font-semibold text-white">{category}</h3>
                          <span className="text-xs text-quantum-zinc">{perms.length} permissions</span>
                        </button>

                        {expandedCategories.has(category) && (
                          <div className="border-t divide-y" style={{ borderColor: 'rgba(217, 176, 97, 0.08)' }}>
                            {perms.map((perm) => {
                              const state = editOverrides[perm] || 'role';
                              const hasRole = selectedEntry?.rolePermissions.includes(perm);
                              const isEffective = state === 'granted' || (state === 'role' && hasRole);

                              return (
                                <div key={perm}
                                  onClick={() => togglePermission(perm)}
                                  className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                                    state === 'granted' ? 'bg-green-900/20 hover:bg-green-900/30' :
                                    state === 'denied' ? 'bg-red-900/20 hover:bg-red-900/30' :
                                    'hover:bg-white/[0.02]'
                                  }`}>
                                  <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded flex items-center justify-center ${
                                      isEffective ? 'bg-green-600' : 'bg-gray-700'
                                    }`}>
                                      {isEffective ? <Check className="w-4 h-4 text-white" /> : <X className="w-4 h-4 text-gray-500" />}
                                    </div>
                                    <div>
                                      <p className="text-sm text-gray-200 font-mono">{perm}</p>
                                      <p className="text-xs text-quantum-zinc capitalize">{getPermLabel(perm)}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {hasRole && (
                                      <span className="text-xs text-quantum-zinc bg-white/[0.03] px-2 py-0.5 rounded">role default</span>
                                    )}
                                    {state === 'granted' && (
                                      <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                        <Check className="w-3 h-3" /> granted
                                      </span>
                                    )}
                                    {state === 'denied' && (
                                      <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                        <X className="w-3 h-3" /> denied
                                      </span>
                                    )}
                                    {state === 'role' && (
                                      <span className="text-xs text-gray-500">
                                        <Minus className="w-4 h-4" />
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Audit Logs */}
          {activeTab === 'audit' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.03]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Time</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Actor</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Action</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Object</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'rgba(217, 176, 97, 0.08)' }}>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-quantum-zinc">{new Date(log.createdAt).toLocaleString('bg-BG')}</td>
                        <td className="px-4 py-3 text-gray-300">{log.actor?.email || 'System'}</td>
                        <td className="px-4 py-3"><span className="badge badge-gray">{log.action}</span></td>
                        <td className="px-4 py-3 text-xs text-quantum-zinc">{log.objectType} {log.objectId?.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-xs font-mono text-quantum-zinc">{log.ipAddress}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {auditLogs.length === 0 && <p className="text-quantum-zinc text-center py-8">No audit logs</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
