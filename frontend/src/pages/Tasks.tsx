import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Plus, ClipboardList, Clock, CheckCircle, XCircle, AlertCircle,
  Upload, Star, MessageSquare, ChevronDown, User, Calendar, Flag,
  Eye, ArrowRight, Image, FileText
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TaskProof {
  id: string;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
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
  assigneeId: string;
  createdById: string;
  reviewRating: number | null;
  reviewComment: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: { id: string; firstName: string; lastName: string; jobTitle?: string; photoUrl?: string | null };
  createdBy: { id: string; firstName: string; lastName: string };
  proofs: TaskProof[];
}

interface TaskStats {
  open: number;
  inProgress: number;
  waitingReview: number;
  approved: number;
  rejected: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  OPEN: { label: 'Open', color: 'bg-blue-900/40 text-blue-400', icon: ClipboardList },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-yellow-900/40 text-yellow-400', icon: Clock },
  COMPLETED: { label: 'Completed', color: 'bg-green-900/40 text-green-400', icon: CheckCircle },
  WAITING_FOR_REVIEW: { label: 'Waiting for Review', color: 'bg-purple-900/40 text-purple-400', icon: Eye },
  APPROVED: { label: 'Approved', color: 'bg-green-900/40 text-green-300', icon: CheckCircle },
  REJECTED: { label: 'Rejected', color: 'bg-red-900/40 text-red-400', icon: XCircle },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Low', color: 'text-gray-400' },
  MEDIUM: { label: 'Medium', color: 'text-blue-400' },
  HIGH: { label: 'High', color: 'text-orange-400' },
  URGENT: { label: 'Urgent', color: 'text-red-400' },
};

const MIN_PROOFS = 3;

export default function Tasks() {
  const { user, hasMinRole } = useAuthStore();
  const isManager = hasMinRole('TEAM_LEAD');

  const [tab, setTab] = useState<'my-tasks' | 'create' | 'review'>('my-tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({ title: '', description: '', priority: 'MEDIUM', assigneeId: '', dueDate: '' });
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string; jobTitle: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Proof upload
  const [uploadingProof, setUploadingProof] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  // Review form
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    loadTasks();
    loadStats();
    if (isManager) loadEmployees();
  }, [tab]);

  async function loadTasks() {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (tab === 'review') params.view = 'review';
      const { data } = await api.get('/tasks', { params });
      setTasks(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadStats() {
    try {
      const { data } = await api.get('/tasks/stats/summary');
      setStats(data.data);
    } catch { /* ignore */ }
  }

  async function loadEmployees() {
    try {
      const { data } = await api.get('/employees', { params: { limit: '100' } });
      setEmployees((data.data || []).map((e: any) => ({
        id: e.id, firstName: e.firstName, lastName: e.lastName, jobTitle: e.jobTitle,
      })));
    } catch { /* ignore */ }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.title || !createForm.assigneeId) {
      setCreateError('Title and assignee are required');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await api.post('/tasks', {
        title: createForm.title,
        description: createForm.description || undefined,
        priority: createForm.priority,
        assigneeId: createForm.assigneeId,
        dueDate: createForm.dueDate || undefined,
      });
      setCreateForm({ title: '', description: '', priority: 'MEDIUM', assigneeId: '', dueDate: '' });
      setTab('my-tasks');
      await loadTasks();
      await loadStats();
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to create task');
    }
    setCreating(false);
  }

  async function handleStatusChange(taskId: string, newStatus: string) {
    try {
      await api.post(`/tasks/${taskId}/status`, { status: newStatus });
      await loadTasks();
      await loadStats();
      if (selectedTask?.id === taskId) {
        const { data } = await api.get(`/tasks/${taskId}`);
        setSelectedTask(data.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to change status');
    }
  }

  async function handleProofUpload(taskId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingProof(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append('proofs', f));
      const { data } = await api.post(`/tasks/${taskId}/proofs`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelectedTask(data.data);
      await loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to upload proofs');
    }
    setUploadingProof(false);
    if (proofInputRef.current) proofInputRef.current.value = '';
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
      await loadTasks();
      await loadStats();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to submit review');
    }
    setReviewing(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        {isManager && (
          <button onClick={() => setTab('create')} className="btn-primary">
            <Plus className="w-4 h-4 mr-1" /> New Task
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {([
            ['Open', stats.open, 'bg-blue-900/30 text-blue-400'],
            ['In Progress', stats.inProgress, 'bg-yellow-900/30 text-yellow-400'],
            ['Waiting Review', stats.waitingReview, 'bg-purple-900/30 text-purple-400'],
            ['Approved', stats.approved, 'bg-green-900/30 text-green-400'],
            ['Rejected', stats.rejected, 'bg-red-900/30 text-red-400'],
          ] as [string, number, string][]).map(([label, count, color]) => (
            <div key={label} className="card p-3 text-center">
              <p className={`text-2xl font-bold ${color.split(' ')[1]}`}>{count}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-2">
        <button
          onClick={() => setTab('my-tasks')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${tab === 'my-tasks' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <ClipboardList className="w-4 h-4 inline mr-1" /> {isManager ? 'All Tasks' : 'My Tasks'}
        </button>
        {isManager && (
          <>
            <button
              onClick={() => setTab('review')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${tab === 'review' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Eye className="w-4 h-4 inline mr-1" /> Review Queue
              {stats && stats.waitingReview > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-purple-900/60 text-purple-300">{stats.waitingReview}</span>
              )}
            </button>
            <button
              onClick={() => setTab('create')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${tab === 'create' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Plus className="w-4 h-4 inline mr-1" /> Create Task
            </button>
          </>
        )}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task List */}
        <div className={`${selectedTask ? 'lg:col-span-1' : 'lg:col-span-3'} space-y-3`}>
          {tab === 'create' ? (
            <CreateTaskForm
              form={createForm}
              setForm={setCreateForm}
              employees={employees}
              creating={creating}
              error={createError}
              onSubmit={handleCreateTask}
            />
          ) : loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="card p-12 text-center">
              <ClipboardList className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-lg font-medium text-white">{tab === 'review' ? 'No tasks pending review' : 'No tasks found'}</p>
              <p className="text-sm text-gray-400 mt-1">
                {tab === 'review' ? 'All tasks have been reviewed' : isManager ? 'Create a task to get started' : 'No tasks assigned to you yet'}
              </p>
            </div>
          ) : (
            tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                isSelected={selectedTask?.id === task.id}
                onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                isManager={isManager}
              />
            ))
          )}
        </div>

        {/* Task Detail Panel */}
        {selectedTask && (
          <div className="lg:col-span-2">
            <TaskDetail
              task={selectedTask}
              isManager={isManager}
              onStatusChange={handleStatusChange}
              onProofUpload={handleProofUpload}
              uploadingProof={uploadingProof}
              proofInputRef={proofInputRef}
              reviewForm={reviewForm}
              setReviewForm={setReviewForm}
              onReview={handleReview}
              reviewing={reviewing}
              onClose={() => setSelectedTask(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TaskCard({ task, isSelected, onClick, isManager }: {
  task: Task; isSelected: boolean; onClick: () => void; isManager: boolean;
}) {
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.OPEN;
  const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.MEDIUM;
  const StatusIcon = statusCfg.icon;

  return (
    <div
      onClick={onClick}
      className={`card p-4 cursor-pointer transition-all hover:border-primary-800/50 ${isSelected ? 'border-primary-700 bg-gray-800/60' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 px-2 py-1 rounded text-xs font-medium ${statusCfg.color}`}>
          <StatusIcon className="w-3 h-3 inline mr-0.5" />
          {statusCfg.label}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white truncate">{task.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" /> {task.assignee.firstName} {task.assignee.lastName}
            </span>
            <span className={`flex items-center gap-1 ${priorityCfg.color}`}>
              <Flag className="w-3 h-3" /> {priorityCfg.label}
            </span>
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {new Date(task.dueDate).toLocaleDateString('bg-BG')}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Image className="w-3 h-3" /> {task.proofs.length} proof{task.proofs.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {task.reviewRating && (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`w-3 h-3 ${i < task.reviewRating! ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskDetail({ task, isManager, onStatusChange, onProofUpload, uploadingProof, proofInputRef, reviewForm, setReviewForm, onReview, reviewing, onClose }: {
  task: Task;
  isManager: boolean;
  onStatusChange: (taskId: string, status: string) => void;
  onProofUpload: (taskId: string, files: FileList | null) => void;
  uploadingProof: boolean;
  proofInputRef: React.RefObject<HTMLInputElement>;
  reviewForm: { rating: number; comment: string };
  setReviewForm: (f: { rating: number; comment: string }) => void;
  onReview: (taskId: string, action: 'APPROVED' | 'REJECTED') => void;
  reviewing: boolean;
  onClose: () => void;
}) {
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.OPEN;
  const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.MEDIUM;

  const STATUS_TRANSITIONS: Record<string, string[]> = {
    OPEN: ['IN_PROGRESS'],
    IN_PROGRESS: ['WAITING_FOR_REVIEW'],
    REJECTED: ['IN_PROGRESS'],
  };

  const allowedTransitions = STATUS_TRANSITIONS[task.status] || [];
  const canUploadProofs = !['APPROVED'].includes(task.status);

  return (
    <div className="card p-6 space-y-5 sticky top-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{task.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
            <span className={`text-xs ${priorityCfg.color}`}><Flag className="w-3 h-3 inline" /> {priorityCfg.label}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm">Close</button>
      </div>

      {/* Description */}
      {task.description && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Description</p>
          <p className="text-sm text-gray-300">{task.description}</p>
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Assigned to</p>
          <Link to={`/employees/${task.assignee.id}`} className="text-primary-400 hover:underline">
            {task.assignee.firstName} {task.assignee.lastName}
          </Link>
        </div>
        <div>
          <p className="text-xs text-gray-500">Created by</p>
          <p className="text-gray-300">{task.createdBy.firstName} {task.createdBy.lastName}</p>
        </div>
        {task.dueDate && (
          <div>
            <p className="text-xs text-gray-500">Due date</p>
            <p className="text-gray-300">{new Date(task.dueDate).toLocaleDateString('bg-BG')}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-500">Created</p>
          <p className="text-gray-300">{new Date(task.createdAt).toLocaleDateString('bg-BG')}</p>
        </div>
      </div>

      {/* Review info */}
      {task.reviewRating && (
        <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700">
          <p className="text-xs text-gray-500 mb-1">Review</p>
          <div className="flex items-center gap-1 mb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`w-4 h-4 ${i < task.reviewRating! ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`} />
            ))}
            <span className="text-sm text-gray-400 ml-1">{task.reviewRating}/5</span>
          </div>
          {task.reviewComment && <p className="text-sm text-gray-300">"{task.reviewComment}"</p>}
        </div>
      )}

      {/* Proofs section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500">
            Proofs ({task.proofs.length}/{MIN_PROOFS} minimum)
          </p>
          {canUploadProofs && (
            <>
              <button
                onClick={() => proofInputRef.current?.click()}
                disabled={uploadingProof}
                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                {uploadingProof ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-400"></div>
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                Upload Proofs
              </button>
              <input
                ref={proofInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => onProofUpload(task.id, e.target.files)}
                className="hidden"
              />
            </>
          )}
        </div>
        {task.proofs.length === 0 ? (
          <p className="text-sm text-gray-600">No proofs uploaded yet</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {task.proofs.map(proof => (
              <a key={proof.id} href={proof.fileUrl} target="_blank" rel="noopener noreferrer"
                className="aspect-square rounded-lg overflow-hidden bg-gray-800 border border-gray-700 hover:border-primary-700 transition-colors flex items-center justify-center">
                {proof.mimeType?.startsWith('image/') ? (
                  <img src={proof.fileUrl} alt={proof.fileName} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-2">
                    <FileText className="w-6 h-6 text-gray-500 mx-auto" />
                    <p className="text-xs text-gray-500 mt-1 truncate">{proof.fileName}</p>
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
        {task.proofs.length < MIN_PROOFS && !['APPROVED', 'WAITING_FOR_REVIEW'].includes(task.status) && (
          <p className="text-xs text-yellow-500 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {MIN_PROOFS - task.proofs.length} more proof{MIN_PROOFS - task.proofs.length > 1 ? 's' : ''} needed to complete
          </p>
        )}
      </div>

      {/* Status actions for assignee */}
      {allowedTransitions.length > 0 && !isManager && (
        <div className="flex gap-2">
          {allowedTransitions.map(status => {
            const cfg = STATUS_CONFIG[status];
            return (
              <button
                key={status}
                onClick={() => onStatusChange(task.id, status)}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-500 text-sm"
              >
                <ArrowRight className="w-4 h-4" /> {cfg?.label || status}
              </button>
            );
          })}
        </div>
      )}

      {/* Manager: assignee actions too (they can also change status) */}
      {allowedTransitions.length > 0 && isManager && task.status !== 'WAITING_FOR_REVIEW' && (
        <div className="flex gap-2">
          {allowedTransitions.map(status => {
            const cfg = STATUS_CONFIG[status];
            return (
              <button
                key={status}
                onClick={() => onStatusChange(task.id, status)}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm"
              >
                <ArrowRight className="w-4 h-4" /> {cfg?.label || status}
              </button>
            );
          })}
        </div>
      )}

      {/* Review UI (for managers on WAITING_FOR_REVIEW tasks) */}
      {isManager && task.status === 'WAITING_FOR_REVIEW' && (
        <div className="border-t border-gray-700 pt-4 space-y-3">
          <h4 className="text-sm font-semibold text-white">Review This Task</h4>

          {/* Rating */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Rating</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setReviewForm({ ...reviewForm, rating: n })}
                  className="p-0.5"
                >
                  <Star className={`w-6 h-6 transition-colors ${n <= reviewForm.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600 hover:text-yellow-600'}`} />
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
              placeholder="Optional review comment..."
              className="input-field text-sm"
              rows={2}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => onReview(task.id, 'APPROVED')}
              disabled={reviewing}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 rounded-lg bg-green-600 text-white hover:bg-green-500 text-sm font-medium disabled:opacity-50"
            >
              {reviewing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <CheckCircle className="w-4 h-4" />}
              Approve
            </button>
            <button
              onClick={() => onReview(task.id, 'REJECTED')}
              disabled={reviewing}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" /> Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTaskForm({ form, setForm, employees, creating, error, onSubmit }: {
  form: { title: string; description: string; priority: string; assigneeId: string; dueDate: string };
  setForm: (f: typeof form) => void;
  employees: { id: string; firstName: string; lastName: string; jobTitle: string }[];
  creating: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Create New Task</h3>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-gray-400">Title *</label>
          <input
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="input-field"
            placeholder="Task title..."
            required
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="input-field"
            rows={3}
            placeholder="Task description..."
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400">Priority</label>
            <select
              value={form.priority}
              onChange={e => setForm({ ...form, priority: e.target.value })}
              className="input-field"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">Due Date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm({ ...form, dueDate: e.target.value })}
              className="input-field"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400">Assign to *</label>
          <select
            value={form.assigneeId}
            onChange={e => setForm({ ...form, assigneeId: e.target.value })}
            className="input-field"
            required
          >
            <option value="">Select employee...</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName} — {emp.jobTitle}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p className="text-sm text-red-400 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}
        <button type="submit" disabled={creating} className="btn-primary w-full">
          {creating ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mx-auto"></div>
          ) : (
            <><Plus className="w-4 h-4 mr-1" /> Create Task</>
          )}
        </button>
      </form>
    </div>
  );
}
