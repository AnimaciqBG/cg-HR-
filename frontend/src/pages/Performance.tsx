import { useEffect, useState } from 'react';
import api from '../services/api';
import { Award, Plus, Star, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

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

  const statusColors: Record<string, string> = {
    DRAFT: 'badge-gray', IN_PROGRESS: 'badge-yellow', COMPLETED: 'badge-green', ACKNOWLEDGED: 'badge-blue',
  };

  function renderStars(score?: number) {
    if (!score) return null;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} className={`w-4 h-4 ${i <= score ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
        ))}
        <span className="text-sm ml-1">{score.toFixed(1)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Performance Reviews</h1>
        {hasMinRole('TEAM_LEAD') && (
          <button className="btn-primary"><Plus className="w-4 h-4 mr-1" /> New Review</button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Award className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No performance reviews yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{review.employee.firstName} {review.employee.lastName}</p>
                    <span className={`badge ${statusColors[review.status] || 'badge-gray'}`}>{review.status}</span>
                  </div>
                  <p className="text-sm text-gray-500">{review.employee.jobTitle}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {review.period} {review.year}{review.quarter ? ` Q${review.quarter}` : ''} | Reviewer: {review.reviewer.firstName} {review.reviewer.lastName}
                  </p>
                </div>
                {renderStars(review.overallScore)}
              </div>
              {(review.strengths || review.improvements) && (
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  {review.strengths && (
                    <div>
                      <p className="text-xs font-medium text-green-600 mb-1">Strengths</p>
                      <p className="text-gray-600 dark:text-gray-400">{review.strengths}</p>
                    </div>
                  )}
                  {review.improvements && (
                    <div>
                      <p className="text-xs font-medium text-orange-600 mb-1">Areas for Improvement</p>
                      <p className="text-gray-600 dark:text-gray-400">{review.improvements}</p>
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
