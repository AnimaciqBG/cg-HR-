import { useEffect, useState } from 'react';
import api from '../services/api';
import { Award, Plus, Star, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

interface Review {
  id: string;
  period: string;
  year: number;
  quarter?: number;
  status: string;
  overallScore?: number;
  strengths?: string;
  improvements?: string;
  employee: { firstName: string; lastName: string; jobTitle: string };
  reviewer: { firstName: string; lastName: string };
}

export default function Performance() {
  const { hasMinRole } = useAuthStore();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [form, setForm] = useState({
    employeeId: '', period: 'QUARTERLY', year: new Date().getFullYear(),
    strengths: '', improvements: '', overallScore: 3,
  });

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/performance/reviews?limit=50');
        setReviews(data.data || []);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (showCreate) {
      api.get('/employees?limit=100').then(({ data }) => setEmployees(data.data || [])).catch(() => {});
    }
  }, [showCreate]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/performance/reviews', form);
      toast.success('Review created');
      setShowCreate(false);
      setForm({ employeeId: '', period: 'QUARTERLY', year: new Date().getFullYear(), strengths: '', improvements: '', overallScore: 3 });
      const { data } = await api.get('/performance/reviews?limit=50');
      setReviews(data.data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create review');
    }
    setCreating(false);
  }

  const statusColors: Record<string, string> = {
    DRAFT: 'badge-gray', IN_PROGRESS: 'badge-yellow', COMPLETED: 'badge-green', ACKNOWLEDGED: 'badge-blue',
  };

  function renderStars(score?: number) {
    if (!score) return null;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} className={`w-4 h-4 ${i <= score ? 'text-primary-400 fill-primary-400' : 'text-gray-600'}`} />
        ))}
        <span className="text-sm ml-1 text-gray-300">{score.toFixed(1)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Performance Reviews</h1>
        {hasMinRole('TEAM_LEAD') && (
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary"><Plus className="w-4 h-4 mr-1" /> New Review</button>
        )}
      </div>

      {showCreate && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">New Performance Review</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-300">Employee</label>
                <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="input-field mt-1" required>
                  <option value="">Select...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300">Period</label>
                <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="input-field mt-1">
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="SEMI_ANNUAL">Semi-Annual</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300">Year</label>
                <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })} className="input-field mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300">Overall Score (1-5)</label>
              <div className="flex items-center gap-2 mt-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <button key={i} type="button" onClick={() => setForm({ ...form, overallScore: i })} className="focus:outline-none">
                    <Star className={`w-6 h-6 ${i <= form.overallScore ? 'text-primary-400 fill-primary-400' : 'text-gray-600'}`} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300">Strengths</label>
              <textarea value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} className="input-field mt-1" rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300">Areas for Improvement</label>
              <textarea value={form.improvements} onChange={(e) => setForm({ ...form, improvements: e.target.value })} className="input-field mt-1" rows={2} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create Review'}</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Award className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p>No performance reviews yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white">{review.employee.firstName} {review.employee.lastName}</p>
                    <span className={`badge ${statusColors[review.status] || 'badge-gray'}`}>{review.status}</span>
                  </div>
                  <p className="text-sm text-gray-400">{review.employee.jobTitle}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {review.period} {review.year}{review.quarter ? ` Q${review.quarter}` : ''} | Reviewer: {review.reviewer.firstName} {review.reviewer.lastName}
                  </p>
                </div>
                {renderStars(review.overallScore)}
              </div>
              {(review.strengths || review.improvements) && (
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  {review.strengths && (
                    <div>
                      <p className="text-xs font-medium text-green-400 mb-1">Strengths</p>
                      <p className="text-gray-400">{review.strengths}</p>
                    </div>
                  )}
                  {review.improvements && (
                    <div>
                      <p className="text-xs font-medium text-orange-400 mb-1">Areas for Improvement</p>
                      <p className="text-gray-400">{review.improvements}</p>
                    </div>
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
