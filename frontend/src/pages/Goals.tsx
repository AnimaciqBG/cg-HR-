import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Goal, PaginatedResponse } from '../types';
import { Target, Plus, CheckCircle2, AlertTriangle, Circle, XCircle } from 'lucide-react';
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
    NOT_STARTED: <Circle className="w-5 h-5 text-gray-400" />,
    ON_TRACK: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    AT_RISK: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    OFF_TRACK: <XCircle className="w-5 h-5 text-red-500" />,
    COMPLETED: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    CANCELLED: <XCircle className="w-5 h-5 text-gray-400" />,
  };

  const statusColors: Record<string, string> = {
    NOT_STARTED: 'badge-gray', ON_TRACK: 'badge-green', AT_RISK: 'badge-yellow',
    OFF_TRACK: 'badge-red', COMPLETED: 'badge-blue', CANCELLED: 'badge-gray',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Goals & OKRs</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          <Plus className="w-4 h-4 mr-1" /> New Goal
        </button>
      </div>

      {showCreate && (
        <div className="card p-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field mt-1" required />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field mt-1" rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium">Due Date</label>
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
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : goals.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
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
                    <p className="font-semibold">{goal.title}</p>
                    {goal.isCompanyGoal && <span className="badge badge-blue">Company</span>}
                    {goal.isTeamGoal && <span className="badge badge-blue">Team</span>}
                    <span className={`badge ${statusColors[goal.status]}`}>{goal.status}</span>
                  </div>
                  {goal.description && <p className="text-sm text-gray-500 mt-1">{goal.description}</p>}
                  {goal.dueDate && <p className="text-xs text-gray-400 mt-1">Due: {new Date(goal.dueDate).toLocaleDateString('bg-BG')}</p>}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Progress</span>
                      <span className="font-medium">{goal.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${goal.progress >= 100 ? 'bg-green-500' : goal.progress >= 50 ? 'bg-blue-500' : 'bg-yellow-500'}`} style={{ width: `${Math.min(100, goal.progress)}%` }}></div>
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
