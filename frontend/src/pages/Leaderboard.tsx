import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Trophy, Award, Star, User, Building2, TrendingUp, RefreshCw, ArrowLeft
} from 'lucide-react';

interface LeaderboardEntry {
  id: string;
  totalScore: number;
  grade: string;
  avgRating: number;
  totalTasks: number;
  approvedTasks: number;
  onTimeRate: number;
  calculatedAt: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    photoUrl: string | null;
    department: { id: string; name: string } | null;
  };
}

interface Department {
  id: string;
  name: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: 'from-green-500 to-emerald-600',
  B: 'from-blue-500 to-blue-600',
  C: 'from-yellow-500 to-amber-600',
  D: 'from-orange-500 to-orange-600',
  F: 'from-red-500 to-red-600',
};

const PODIUM_COLORS = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];

export default function Leaderboard() {
  const { hasMinRole } = useAuthStore();
  const isManager = hasMinRole('TEAM_LEAD');

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    loadLeaderboard();
    loadDepartments();
  }, [departmentFilter]);

  async function loadLeaderboard() {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '30' };
      if (departmentFilter) params.departmentId = departmentFilter;
      const { data } = await api.get('/scores/leaderboard', { params });
      setEntries(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadDepartments() {
    try {
      const { data } = await api.get('/employees', { params: { limit: '200' } });
      const depts = new Map<string, string>();
      (data.data || []).forEach((e: any) => {
        if (e.department) depts.set(e.department.id, e.department.name);
      });
      setDepartments(Array.from(depts, ([id, name]) => ({ id, name })));
    } catch { /* ignore */ }
  }

  async function handleRecalculateAll() {
    setRecalculating(true);
    try {
      await api.post('/scores/calculate-all');
      await loadLeaderboard();
    } catch { /* ignore */ }
    setRecalculating(false);
  }

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Trophy className="w-12 h-12 mb-3 text-gray-600" />
        <p className="text-lg font-medium text-white">Access Restricted</p>
        <p className="text-sm text-quantum-zinc">Leaderboard is only available to managers and administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold italic text-gradient-gold flex items-center gap-2">
            <Trophy className="w-7 h-7 text-yellow-400" /> Leaderboard
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
            className="input-field text-sm py-1.5"
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button
            onClick={handleRecalculateAll}
            disabled={recalculating}
            className="btn-secondary text-sm"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${recalculating ? 'animate-spin' : ''}`} />
            Recalculate All
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      ) : entries.length === 0 ? (
        <div className="card p-12 text-center">
          <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-lg font-medium text-white">No Scores Yet</p>
          <p className="text-sm text-quantum-zinc mt-1">Click "Recalculate All" to generate performance scores for all employees.</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {entries.length >= 3 && (
            <div className="grid grid-cols-3 gap-4">
              {[entries[1], entries[0], entries[2]].map((entry, idx) => {
                const rank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                const podiumColor = PODIUM_COLORS[rank - 1];
                return (
                  <div key={entry.id} className={`card p-5 text-center ${rank === 1 ? 'ring-2 ring-yellow-500/30 bg-yellow-900/5' : ''}`}>
                    <div className={`text-3xl font-bold ${podiumColor} mb-2`}>
                      #{rank}
                    </div>
                    <div className="w-16 h-16 mx-auto rounded-full bg-primary-500/10 flex items-center justify-center overflow-hidden mb-2">
                      {entry.employee.photoUrl ? (
                        <img src={entry.employee.photoUrl} alt="" className="w-16 h-16 object-cover rounded-full" />
                      ) : (
                        <User className="w-8 h-8 text-primary-400" />
                      )}
                    </div>
                    <Link to={`/employees/${entry.employee.id}`} className="font-semibold text-white hover:text-primary-400">
                      {entry.employee.firstName} {entry.employee.lastName}
                    </Link>
                    <p className="text-xs text-quantum-zinc">{entry.employee.jobTitle}</p>
                    <div className={`mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r ${GRADE_COLORS[entry.grade]} text-white text-sm font-bold`}>
                      <Award className="w-3.5 h-3.5" /> {entry.grade} ({Math.round(entry.totalScore)})
                    </div>
                    <div className="flex justify-center gap-0.5 mt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-3 h-3 ${i < Math.round(entry.avgRating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full leaderboard table */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b text-xs text-quantum-zinc" style={{ borderColor: 'rgba(217, 176, 97, 0.08)' }}>
                  <th className="text-left p-3 w-12">#</th>
                  <th className="text-left p-3">Employee</th>
                  <th className="text-left p-3">Department</th>
                  <th className="text-center p-3">Grade</th>
                  <th className="text-center p-3">Score</th>
                  <th className="text-center p-3">Avg Rating</th>
                  <th className="text-center p-3">Tasks</th>
                  <th className="text-center p-3">On-time</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr key={entry.id} className="border-b hover:bg-white/[0.02]" style={{ borderColor: 'rgba(217, 176, 97, 0.05)' }}>
                    <td className="p-3">
                      <span className={`text-sm font-bold ${idx < 3 ? PODIUM_COLORS[idx] : 'text-quantum-zinc'}`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {entry.employee.photoUrl ? (
                            <img src={entry.employee.photoUrl} alt="" className="w-8 h-8 object-cover rounded-full" />
                          ) : (
                            <User className="w-4 h-4 text-primary-400" />
                          )}
                        </div>
                        <div>
                          <Link to={`/employees/${entry.employee.id}`} className="text-sm font-medium text-white hover:text-primary-400">
                            {entry.employee.firstName} {entry.employee.lastName}
                          </Link>
                          <p className="text-xs text-quantum-zinc">{entry.employee.jobTitle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      {entry.employee.department ? (
                        <span className="text-xs text-quantum-zinc flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {entry.employee.department.name}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-bold bg-gradient-to-r ${GRADE_COLORS[entry.grade]} text-white`}>
                        {entry.grade}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-sm font-semibold text-white">{Math.round(entry.totalScore)}</span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < Math.round(entry.avgRating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-700'}`} />
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-sm text-gray-300">{entry.approvedTasks}/{entry.totalTasks}</span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-sm font-medium ${entry.onTimeRate >= 0.8 ? 'text-green-400' : entry.onTimeRate >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {Math.round(entry.onTimeRate * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
