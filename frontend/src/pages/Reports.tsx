import { useEffect, useState } from 'react';
import api from '../services/api';
import { BarChart3, Users, CalendarDays, Clock, Coffee, Download, Lock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface HeadcountReport {
  total: number;
  byDepartment: { name: string; count: number }[];
  byLocation: { name: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byContractType: { contractType: string; count: number }[];
}

export default function Reports() {
  const { hasMinRole } = useAuthStore();
  const [headcount, setHeadcount] = useState<HeadcountReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState('headcount');

  useEffect(() => {
    if (!hasMinRole('HR')) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const { data } = await api.get('/reports/headcount');
        setHeadcount(data);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  // Access check
  if (!hasMinRole('HR')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Lock className="w-12 h-12 mb-3 text-gray-600" />
        <p className="text-lg font-medium text-white">Access Restricted</p>
        <p className="text-sm text-quantum-zinc">Reports are only available to administrators and management.</p>
      </div>
    );
  }

  const reports = [
    { key: 'headcount', label: 'Headcount', icon: Users },
    { key: 'absence', label: 'Absence', icon: CalendarDays },
    { key: 'overtime', label: 'Overtime', icon: Clock },
    { key: 'breaks', label: 'Break Analysis', icon: Coffee },
  ];

  async function exportReport(type: string) {
    try {
      await api.post('/reports/export', { reportType: type, format: 'csv' });
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold italic text-gradient-gold">Analytics & Reports</h1>
        <button onClick={() => exportReport(activeReport)} className="btn-secondary">
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </button>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-2 flex-wrap">
        {reports.map(r => (
          <button key={r.key} onClick={() => setActiveReport(r.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeReport === r.key ? 'bg-primary-500/10 text-primary-400' : 'bg-white/[0.03] text-quantum-zinc'}`}>
            <r.icon className="w-4 h-4" /> {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
      ) : headcount ? (
        <div className="space-y-6">
          {/* Total */}
          <div className="card p-6 text-center">
            <p className="text-sm text-quantum-zinc tracking-wide">Total Active Employees</p>
            <p className="text-5xl font-bold mt-2 text-white">{headcount.total}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Location */}
            <div className="card p-6">
              <h3 className="font-semibold mb-4 tracking-wide text-white">By Location</h3>
              <div className="space-y-3">
                {headcount.byLocation.map((l) => (
                  <div key={l.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{l.name}</span>
                      <span className="font-medium text-white">{l.count}</span>
                    </div>
                    <div className="w-full bg-white/[0.03] rounded-full h-2">
                      <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${(l.count / headcount.total) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Status */}
            <div className="card p-6">
              <h3 className="font-semibold mb-4 tracking-wide text-white">By Status</h3>
              <div className="space-y-2">
                {headcount.byStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between p-2 rounded-2xl bg-white/[0.03]">
                    <span className="text-sm text-gray-300">{s.status}</span>
                    <span className="font-bold text-white">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By Contract */}
            <div className="card p-6 md:col-span-2">
              <h3 className="font-semibold mb-4 tracking-wide text-white">By Contract Type</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {headcount.byContractType.map((c) => (
                  <div key={c.contractType} className="text-center p-4 rounded-2xl bg-white/[0.03]">
                    <p className="text-2xl font-bold text-primary-400">{c.count}</p>
                    <p className="text-xs text-quantum-zinc mt-1">{c.contractType}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-quantum-zinc">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p>No report data available</p>
        </div>
      )}
    </div>
  );
}
