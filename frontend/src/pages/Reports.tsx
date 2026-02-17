import { useEffect, useState } from 'react';
import api from '../services/api';
import { BarChart3, Users, CalendarDays, Clock, Coffee, Download, TrendingDown, TrendingUp } from 'lucide-react';

interface HeadcountReport {
  total: number;
  byDepartment: { name: string; count: number }[];
  byLocation: { name: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byContractType: { contractType: string; count: number }[];
}

export default function Reports() {
  const [headcount, setHeadcount] = useState<HeadcountReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState('headcount');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/reports/headcount');
        setHeadcount(data);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

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
        <h1 className="text-2xl font-bold">Analytics & Reports</h1>
        <button onClick={() => exportReport(activeReport)} className="btn-secondary">
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </button>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-2 flex-wrap">
        {reports.map(r => (
          <button key={r.key} onClick={() => setActiveReport(r.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeReport === r.key ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
            <r.icon className="w-4 h-4" /> {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : headcount ? (
        <div className="space-y-6">
          {/* Total */}
          <div className="card p-6 text-center">
            <p className="text-sm text-gray-500">Total Active Employees</p>
            <p className="text-5xl font-bold mt-2">{headcount.total}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Department */}
            <div className="card p-6">
              <h3 className="font-semibold mb-4">By Department</h3>
              <div className="space-y-3">
                {headcount.byDepartment.map((d) => (
                  <div key={d.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{d.name}</span>
                      <span className="font-medium">{d.count}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-primary-600 h-2 rounded-full" style={{ width: `${(d.count / headcount.total) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Location */}
            <div className="card p-6">
              <h3 className="font-semibold mb-4">By Location</h3>
              <div className="space-y-3">
                {headcount.byLocation.map((l) => (
                  <div key={l.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{l.name}</span>
                      <span className="font-medium">{l.count}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(l.count / headcount.total) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Status */}
            <div className="card p-6">
              <h3 className="font-semibold mb-4">By Status</h3>
              <div className="space-y-2">
                {headcount.byStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-sm">{s.status}</span>
                    <span className="font-bold">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By Contract */}
            <div className="card p-6">
              <h3 className="font-semibold mb-4">By Contract Type</h3>
              <div className="space-y-2">
                {headcount.byContractType.map((c) => (
                  <div key={c.contractType} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-sm">{c.contractType}</span>
                    <span className="font-bold">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No report data available</p>
        </div>
      )}
    </div>
  );
}
