import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Goal, PaginatedResponse } from '../types';
import { Target, Plus, CheckCircle2, AlertTriangle, Circle, XCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '' });

  useEffect(() => { fetchGoals(); }, []);

  async function fetchGoals() {
    try {
      const { data } = await api.get<PaginatedResponse<Goal>>('/goals?limit=50');
      setGoals(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/goals', form);
      toast.success('Goal created');
      setShowCreate(false);
      setForm({ title: '', description: '', dueDate: '' });
      fetchGoals();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  }

  const statusIcons: Record<string, JSX.Element> = {
    NOT_STARTED: <Circle className="w-5 h-5 text-gray-500" />,
    ON_TRACK: <CheckCircle2 className="w-5 h-5 text-green-400" />,
    AT_RISK: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
    OFF_TRACK: <XCircle className="w-5 h-5 text-red-400" />,
    COMPLETED: <CheckCircle2 className="w-5 h-5 text-primary-400" />,
    CANCELLED: <XCircle className="w-5 h-5 text-gray-500" />,
  };

  const statusColors: Record<string, string> = {
    NOT_STARTED: 'badge-gray', ON_TRACK: 'badge-green', AT_RISK: 'badge-yellow',
    OFF_TRACK: 'badge-red', COMPLETED: 'badge-blue', CANCELLED: 'badge-gray',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold italic text-gradient-gold">Goals & OKRs</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          <Plus className="w-4 h-4 mr-1" /> New Goal
        </button>
      </div>

      {showCreate && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold tracking-wide text-white">New Goal</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label-luxury">Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field mt-1" required />
            </div>
            <div>
              <label className="label-luxury">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field mt-1" rows={3} />
            </div>
            <div>
              <label className="label-luxury">Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="input-field mt-1" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
      ) : goals.length === 0 ? (
        <div className="text-center py-12 text-quantum-zinc">
          <Target className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p>No goals yet. Create your first goal!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => (
            <div key={goal.id} className="card p-5">
              <div className="flex items-start gap-3">
                {statusIcons[goal.status]}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white">{goal.title}</p>
                    {goal.isCompanyGoal && <span className="badge badge-yellow">Company</span>}
                    {goal.isTeamGoal && <span className="badge badge-blue">Team</span>}
                    <span className={`badge ${statusColors[goal.status]}`}>{goal.status}</span>
                  </div>
                  {goal.description && <p className="text-sm text-quantum-zinc mt-1">{goal.description}</p>}
                  {goal.dueDate && <p className="text-xs text-quantum-zinc mt-1">Due: {new Date(goal.dueDate).toLocaleDateString('bg-BG')}</p>}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-quantum-zinc">Progress</span>
                      <span className="font-medium text-white">{goal.progress}%</span>
                    </div>
                    <div className="w-full bg-white/[0.03] rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${goal.progress >= 100 ? 'bg-green-500' : goal.progress >= 50 ? 'bg-primary-500' : 'bg-yellow-500'}`} style={{ width: `${Math.min(100, goal.progress)}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
