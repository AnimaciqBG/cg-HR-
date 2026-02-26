import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft, CheckCircle, XCircle, Star, Eye, User, Calendar, Flag,
  Image, FileText, Clock, AlertCircle
} from 'lucide-react';

interface TaskProof {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  assignee: { id: string; firstName: string; lastName: string; jobTitle?: string; photoUrl?: string | null };
  createdBy: { id: string; firstName: string; lastName: string };
  proofs: TaskProof[];
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-gray-400', MEDIUM: 'text-blue-400', HIGH: 'text-orange-400', URGENT: 'text-red-400',
};

export default function TaskReview() {
  const { hasMinRole } = useAuthStore();
  const isManager = hasMinRole('TEAM_LEAD');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [reviewing, setReviewing] = useState(false);
  const [selectedProof, setSelectedProof] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      const { data } = await api.get('/tasks', { params: { view: 'review', limit: '50' } });
      setTasks(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleReview(taskId: string, action: 'APPROVED' | 'REJECTED') {
    setReviewing(true);
    try {
      await api.post(`/tasks/${taskId}/review`, {
        action,
        rating: reviewForm.rating,
        comment: reviewForm.comment || undefined,
      });
      setSelectedTask(null);
      setReviewForm({ rating: 5, comment: '' });
      setSelectedProof(null);
      await loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to submit review');
    }
    setReviewing(false);
  }

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Eye className="w-12 h-12 mb-3 text-gray-600" />
        <p className="text-lg font-medium text-white">Access Restricted</p>
        <p className="text-sm text-quantum-zinc">Task review is only available to managers and administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/tasks" className="p-2 rounded-lg hover:bg-gray-700 text-gray-300">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold italic text-gradient-gold">Task Review Queue</h1>
        {tasks.length > 0 && (
          <span className="badge bg-purple-500/10 text-purple-400">{tasks.length} pending</span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-white">All Clear</p>
          <p className="text-sm text-quantum-zinc mt-1">No tasks pending review</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Task List */}
          <div className="space-y-3">
            {tasks.map(task => (
              <div
                key={task.id}
                onClick={() => { setSelectedTask(task); setReviewForm({ rating: 5, comment: '' }); setSelectedProof(null); }}
                className={`card p-4 cursor-pointer transition-all hover:border-purple-800/50 ${selectedTask?.id === task.id ? 'border-purple-700 bg-white/[0.03]' : ''}`}
              >
                <h3 className="font-medium text-white">{task.title}</h3>
                <div className="flex items-center gap-3 mt-2 text-xs text-quantum-zinc">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> {task.assignee.firstName} {task.assignee.lastName}
                  </span>
                  <span className={`flex items-center gap-1 ${PRIORITY_COLORS[task.priority]}`}>
                    <Flag className="w-3 h-3" /> {task.priority}
                  </span>
                  <span className="flex items-center gap-1">
                    <Image className="w-3 h-3" /> {task.proofs.length} proofs
                  </span>
                  {task.completedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {new Date(task.completedAt).toLocaleDateString('bg-BG')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Review Detail */}
          {selectedTask && (
            <div className="card p-6 space-y-5 sticky top-4">
              <h2 className="text-lg font-bold text-white">{selectedTask.title}</h2>

              {selectedTask.description && (
                <p className="text-sm text-gray-300">{selectedTask.description}</p>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Assigned to</p>
                  <p className="text-gray-300">{selectedTask.assignee.firstName} {selectedTask.assignee.lastName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Created by</p>
                  <p className="text-gray-300">{selectedTask.createdBy.firstName} {selectedTask.createdBy.lastName}</p>
                </div>
              </div>

              {/* Proofs gallery */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Proof Files ({selectedTask.proofs.length})</p>

                {/* Large preview */}
                {selectedProof && (
                  <div className="mb-3 rounded-xl overflow-hidden bg-white/[0.03] border" style={{ borderColor: 'rgba(217, 176, 97, 0.08)' }}>
                    <img src={selectedProof} alt="" className="w-full max-h-80 object-contain" />
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2">
                  {selectedTask.proofs.map(proof => (
                    <button
                      key={proof.id}
                      onClick={() => setSelectedProof(proof.fileUrl)}
                      className={`aspect-square rounded-2xl overflow-hidden bg-white/[0.03] border transition-colors flex items-center justify-center ${selectedProof === proof.fileUrl ? 'border-primary-500' : 'hover:border-gray-600'}`}
                      style={{ borderColor: selectedProof === proof.fileUrl ? undefined : 'rgba(217, 176, 97, 0.08)' }}
                    >
                      {proof.mimeType?.startsWith('image/') ? (
                        <img src={proof.fileUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <FileText className="w-6 h-6 text-gray-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rating */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Rating</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setReviewForm({ ...reviewForm, rating: n })} className="p-0.5">
                      <Star className={`w-7 h-7 transition-colors ${n <= reviewForm.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600 hover:text-yellow-600'}`} />
                    </button>
                  ))}
                  <span className="text-sm text-gray-400 ml-2">{reviewForm.rating}/5</span>
                </div>
              </div>

              {/* Comment */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Comment</p>
                <textarea
                  value={reviewForm.comment}
                  onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })}
                  placeholder="Review comment (required for rejection)..."
                  className="input-field text-sm"
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleReview(selectedTask.id, 'APPROVED')}
                  disabled={reviewing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-green-600 text-white hover:bg-green-500 font-medium disabled:opacity-50"
                >
                  {reviewing ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <><CheckCircle className="w-5 h-5" /> Approve</>
                  )}
                </button>
                <button
                  onClick={() => handleReview(selectedTask.id, 'REJECTED')}
                  disabled={reviewing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-red-600 text-white hover:bg-red-500 font-medium disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" /> Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
