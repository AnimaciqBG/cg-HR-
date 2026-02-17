import { useEffect, useState } from 'react';
import api from '../services/api';
import { GraduationCap, BookOpen, Award, Clock, CheckCircle } from 'lucide-react';

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
  const [trainings, setTrainings] = useState<TrainingItem[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'catalog' | 'my'>('my');

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

  const statusColors: Record<string, string> = {
    NOT_STARTED: 'badge-gray', IN_PROGRESS: 'badge-yellow', COMPLETED: 'badge-green', OVERDUE: 'badge-red', FAILED: 'badge-red',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Training & Development</h1>

      <div className="flex gap-1 border-b dark:border-gray-700">
        <button onClick={() => setTab('my')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'my' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`}>
          My Training
        </button>
        <button onClick={() => setTab('catalog')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'catalog' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`}>
          Course Catalog
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : tab === 'my' ? (
        enrollments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No training enrollments yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {enrollments.map((e) => (
              <div key={e.id} className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <BookOpen className="w-5 h-5 text-primary-600 mt-0.5" />
                    <div>
                      <p className="font-semibold">{e.training.title}</p>
                      {e.training.description && <p className="text-sm text-gray-500 mt-1">{e.training.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        {e.training.durationMinutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {e.training.durationMinutes} min</span>}
                        {e.training.isMandatory && <span className="badge badge-red">Mandatory</span>}
                        {e.dueDate && <span>Due: {new Date(e.dueDate).toLocaleDateString('bg-BG')}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${statusColors[e.status] || 'badge-gray'}`}>{e.status}</span>
                    {e.score !== null && e.score !== undefined && <p className="text-sm font-medium mt-1">Score: {e.score}%</p>}
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
                <GraduationCap className="w-6 h-6 text-primary-600" />
                <div>
                  <p className="font-semibold">{t.title}</p>
                  {t.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{t.description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    {t.isMandatory && <span className="badge badge-red">Mandatory</span>}
                    {t.durationMinutes && <span className="text-xs text-gray-500">{t.durationMinutes} min</span>}
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
