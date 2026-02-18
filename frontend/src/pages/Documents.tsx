import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Document, PaginatedResponse } from '../types';
import { FileText, Upload, Download, Search, AlertTriangle, X, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

const CATEGORIES = [
  { value: 'CONTRACT', label: 'Contract', icon: '📄' },
  { value: 'WARNING', label: 'Warning', icon: '⚠️' },
  { value: 'DECLARATION', label: 'Declaration', icon: '📋' },
  { value: 'CERTIFICATE', label: 'Certificate', icon: '🏅' },
  { value: 'POLICY', label: 'Policy', icon: '📚' },
  { value: 'OTHER', label: 'Other', icon: '📎' },
];

export default function Documents() {
  const { hasMinRole } = useAuthStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [uploadForm, setUploadForm] = useState({
    title: '', category: 'CONTRACT', assignedToId: '', isConfidential: false,
  });
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => { fetchDocuments(); }, [categoryFilter]);
  useEffect(() => {
    if (showUpload) {
      api.get('/employees?limit=100').then(({ data }) => setEmployees(data.data || [])).catch(() => {});
    }
  }, [showUpload]);

  async function fetchDocuments() {
    setLoading(true);
    try {
      const params = categoryFilter ? `?category=${categoryFilter}&limit=50` : '?limit=50';
      const { data } = await api.get<PaginatedResponse<Document>>(`/documents${params}`);
      setDocuments(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast.error('Please select a file'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', uploadForm.title);
      formData.append('category', uploadForm.category);
      if (uploadForm.assignedToId) formData.append('assignedToId', uploadForm.assignedToId);
      formData.append('isConfidential', String(uploadForm.isConfidential));

      await api.post('/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document uploaded');
      setShowUpload(false);
      setFile(null);
      setUploadForm({ title: '', category: 'CONTRACT', assignedToId: '', isConfidential: false });
      fetchDocuments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to upload');
    }
    setUploading(false);
  }

  function isExpiringSoon(date?: string) {
    if (!date) return false;
    const diff = new Date(date).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  }

  const categoryIcons: Record<string, string> = {};
  CATEGORIES.forEach(c => { categoryIcons[c.value] = c.icon; });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Documents</h1>
        {hasMinRole('TEAM_LEAD') && (
          <button onClick={() => setShowUpload(!showUpload)} className="btn-primary"><Upload className="w-4 h-4 mr-1" /> Upload Document</button>
        )}
      </div>

      {/* Upload Form */}
      {showUpload && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Upload Document</h3>
            <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300">Title</label>
              <input value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} className="input-field mt-1" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-300">Category</label>
                <select value={uploadForm.category} onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })} className="input-field mt-1">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300">Assign to Employee</label>
                <select value={uploadForm.assignedToId} onChange={(e) => setUploadForm({ ...uploadForm, assignedToId: e.target.value })} className="input-field mt-1">
                  <option value="">General (no specific employee)</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300">File</label>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input-field mt-1 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-primary-900/40 file:text-primary-400 file:text-sm" required />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={uploadForm.isConfidential} onChange={(e) => setUploadForm({ ...uploadForm, isConfidential: e.target.checked })} />
              Confidential document
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={uploading} className="btn-primary">{uploading ? 'Uploading...' : 'Upload'}</button>
              <button type="button" onClick={() => setShowUpload(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setCategoryFilter('')} className={`px-3 py-1.5 rounded-lg text-sm ${!categoryFilter ? 'bg-primary-900/40 text-primary-400' : 'bg-gray-800 text-gray-400'}`}>
          All
        </button>
        {CATEGORIES.map(cat => (
          <button key={cat.value} onClick={() => setCategoryFilter(cat.value)} className={`px-3 py-1.5 rounded-lg text-sm ${categoryFilter === cat.value ? 'bg-primary-900/40 text-primary-400' : 'bg-gray-800 text-gray-400'}`}>
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p>No documents found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="card p-4 flex items-center gap-4">
              <div className="text-2xl">{categoryIcons[doc.category] || '📎'}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-white truncate">{doc.title}</p>
                <p className="text-xs text-gray-500">{doc.fileName} - v{doc.version}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="badge badge-gray">{doc.category}</span>
                  {doc.isConfidential && <span className="badge badge-red">Confidential</span>}
                  {doc.assignedTo && (
                    <span className="badge badge-blue flex items-center gap-1">
                      <UserPlus className="w-3 h-3" /> {doc.assignedTo.firstName} {doc.assignedTo.lastName}
                    </span>
                  )}
                  {isExpiringSoon(doc.expiresAt) && (
                    <span className="badge badge-yellow flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Expiring soon
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500">{new Date(doc.createdAt).toLocaleDateString('bg-BG')}</p>
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary p-2">
                <Download className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
