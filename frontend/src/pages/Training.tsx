import { useEffect, useState } from 'react';
import api from '../services/api';
import { GraduationCap, BookOpen, Clock, Plus, X, UserPlus } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

interface TrainingItem {
  id: string;
  title: string;
  description?: string;
  isMandatory: boolean;
  durationMinutes?: number;
  passingScore?: number;
}

interface Enrollment {
  id: string;
  status: string;
  score?: number;
  startedAt?: string;
  completedAt?: string;
  dueDate?: string;
  training: TrainingItem;
}

export default function Training() {
  const { hasMinRole } = useAuthStore();
  const [trainings, setTrainings] = useState<TrainingItem[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'catalog' | 'my'>('my');
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [assignEmployeeId, setAssignEmployeeId] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [createForm, setCreateForm] = useState({ title: '', description: '', isMandatory: false, durationMinutes: 60 });

  useEffect(() => { fetchData(); }, [tab]);

  async function fetchData() {
    setLoading(true);
    try {
      if (tab === 'catalog') {
        const { data } = await api.get('/training?limit=50');
        setTrainings(data.data || []);
      } else {
        const { data } = await api.get('/training/my-enrollments');
        setEnrollments(data || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/training', createForm);
      toast.success('Training created');
      setShowCreate(false);
      setCreateForm({ title: '', description: '', isMandatory: false, durationMinutes: 60 });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
    setCreating(false);
  }

  async function handleAssign(trainingId: string) {
    if (!assignEmployeeId) { toast.error('Select an employee'); return; }
    try {
      await api.post(`/training/${trainingId}/enroll`, {
        employeeId: assignEmployeeId,
        dueDate: assignDueDate || undefined,
      });
      toast.success('Employee enrolled');
      setShowAssign(null);
      setAssignEmployeeId('');
      setAssignDueDate('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to enroll');
    }
  }

  function openAssign(trainingId: string) {
    setShowAssign(trainingId);
    api.get('/employees?limit=100').then(({ data }) => setEmployees(data.data || [])).catch(() => {});
  }

  const statusColors: Record<string, string> = {
    NOT_STARTED: 'badge-gray', IN_PROGRESS: 'badge-yellow', COMPLETED: 'badge-green', OVERDUE: 'badge-red', FAILED: 'badge-red',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Training & Development</h1>
        {hasMinRole('TEAM_LEAD') && tab === 'catalog' && (
          <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4 mr-1" /> New Training</button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-800">
        <button onClick={() => setTab('my')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'my' ? 'border-primary-500 text-primary-400' : 'border-transparent text-gray-500'}`}>
          My Training
        </button>
        <button onClick={() => setTab('catalog')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'catalog' ? 'border-primary-500 text-primary-400' : 'border-transparent text-gray-500'}`}>
          Course Catalog
        </button>
      </div>

      {/* Create Training Form */}
      {showCreate && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">New Training Course</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300">Title</label>
              <input value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} className="input-field mt-1" required />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300">Description</label>
              <textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} className="input-field mt-1" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-300">Duration (minutes)</label>
                <input type="number" value={createForm.durationMinutes} onChange={(e) => setCreateForm({ ...createForm, durationMinutes: parseInt(e.target.value) })} className="input-field mt-1" />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={createForm.isMandatory} onChange={(e) => setCreateForm({ ...createForm, isMandatory: e.target.checked })} />
                  Mandatory training
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create'}</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
      ) : tab === 'my' ? (
        enrollments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p>No training enrollments yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {enrollments.map((e) => (
              <div key={e.id} className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <BookOpen className="w-5 h-5 text-primary-400 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">{e.training.title}</p>
                      {e.training.description && <p className="text-sm text-gray-400 mt-1">{e.training.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        {e.training.durationMinutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {e.training.durationMinutes} min</span>}
                        {e.training.isMandatory && <span className="badge badge-red">Mandatory</span>}
                        {e.dueDate && <span>Due: {new Date(e.dueDate).toLocaleDateString('bg-BG')}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${statusColors[e.status] || 'badge-gray'}`}>{e.status}</span>
                    {e.score !== null && e.score !== undefined && <p className="text-sm font-medium text-white mt-1">Score: {e.score}%</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trainings.map((t) => (
            <div key={t.id} className="card p-5">
              <div className="flex items-start gap-3">
                <GraduationCap className="w-6 h-6 text-primary-400" />
                <div className="flex-1">
                  <p className="font-semibold text-white">{t.title}</p>
                  {t.description && <p className="text-sm text-gray-400 mt-1 line-clamp-2">{t.description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    {t.isMandatory && <span className="badge badge-red">Mandatory</span>}
                    {t.durationMinutes && <span className="text-xs text-gray-500">{t.durationMinutes} min</span>}
                  </div>
                </div>
              </div>
              {hasMinRole('TEAM_LEAD') && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  {showAssign === t.id ? (
                    <div className="space-y-2">
                      <select value={assignEmployeeId} onChange={(e) => setAssignEmployeeId(e.target.value)} className="input-field text-sm">
                        <option value="">Select employee...</option>
                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                      </select>
                      <input type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} className="input-field text-sm" placeholder="Due date (optional)" />
                      <div className="flex gap-2">
                        <button onClick={() => handleAssign(t.id)} className="btn-primary text-xs py-1">Assign</button>
                        <button onClick={() => setShowAssign(null)} className="btn-secondary text-xs py-1">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => openAssign(t.id)} className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1">
                      <UserPlus className="w-4 h-4" /> Assign to employee
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
