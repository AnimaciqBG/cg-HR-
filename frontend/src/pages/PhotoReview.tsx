import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import {
  Camera, CheckCircle, XCircle, Clock, User, ArrowLeft, MessageSquare
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { ROLE_LABELS } from '../types';

interface PendingPhoto {
  id: string;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  status: string;
  createdAt: string;
  uploadedBy: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    photoUrl: string | null;
    user?: { id: string; email: string; role: string } | null;
  };
}

export default function PhotoReview() {
  const { hasPermission } = useAuthStore();
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const canReview = hasPermission('employees:write') || hasPermission('employees:write_all');

  useEffect(() => {
    loadPending();
  }, []);

  async function loadPending() {
    try {
      const { data } = await api.get('/photos/pending');
      setPhotos(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleApprove(photoId: string) {
    setProcessing(photoId);
    try {
      await api.post(`/photos/${photoId}/approve`);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch { /* ignore */ }
    setProcessing(null);
  }

  async function handleReject(photoId: string) {
    setProcessing(photoId);
    try {
      await api.post(`/photos/${photoId}/reject`, { comment: rejectComment });
      setPhotos(prev => prev.filter(p => p.id !== photoId));
      setRejectingId(null);
      setRejectComment('');
    } catch { /* ignore */ }
    setProcessing(null);
  }

  if (!canReview) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Camera className="w-12 h-12 mb-3 text-gray-600" />
        <p className="text-lg font-medium text-white">Access Restricted</p>
        <p className="text-sm text-gray-400">Photo review is only available to managers and administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-700 text-gray-300">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Photo Review Queue</h1>
        {photos.length > 0 && (
          <span className="badge bg-yellow-900/40 text-yellow-400">{photos.length} pending</span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      ) : photos.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-white">All Clear</p>
          <p className="text-sm text-gray-400 mt-1">No photos pending review</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {photos.map((photo) => (
            <div key={photo.id} className="card overflow-hidden">
              {/* Photo preview */}
              <div className="aspect-square bg-gray-800 relative">
                <img src={photo.fileUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 px-2 py-1 rounded bg-yellow-900/80 text-yellow-300 text-xs font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3" /> PENDING
                </div>
              </div>

              {/* Employee info */}
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary-900/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {photo.employee.photoUrl ? (
                      <img src={photo.employee.photoUrl} alt="" className="w-10 h-10 object-cover rounded-full" />
                    ) : (
                      <User className="w-5 h-5 text-primary-400" />
                    )}
                  </div>
                  <div>
                    <Link to={`/employees/${photo.employee.id}`} className="font-medium text-white hover:text-primary-400">
                      {photo.employee.firstName} {photo.employee.lastName}
                    </Link>
                    <p className="text-xs text-gray-400">
                      {photo.employee.jobTitle}
                      {photo.employee.user?.role && ` - ${ROLE_LABELS[photo.employee.user.role as keyof typeof ROLE_LABELS] || photo.employee.user.role}`}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                  Uploaded {new Date(photo.createdAt).toLocaleString('bg-BG')}
                </p>

                {/* Actions */}
                {rejectingId === photo.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={rejectComment}
                      onChange={(e) => setRejectComment(e.target.value)}
                      placeholder="Reason for rejection..."
                      className="input-field text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(photo.id)}
                        disabled={processing === photo.id}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectComment(''); }}
                        className="px-3 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(photo.id)}
                      disabled={processing === photo.id}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 text-sm disabled:opacity-50"
                    >
                      {processing === photo.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <><CheckCircle className="w-4 h-4" /> Approve</>
                      )}
                    </button>
                    <button
                      onClick={() => setRejectingId(photo.id)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-900/40 text-red-400 hover:bg-red-900/60 text-sm"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
