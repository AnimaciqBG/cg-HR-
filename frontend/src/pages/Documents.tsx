import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Document, PaginatedResponse } from '../types';
import { FileText, Upload, Download, Folder, Search, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

const CATEGORIES = ['CONTRACT', 'WARNING', 'REQUEST', 'DECLARATION', 'CERTIFICATE', 'POLICY', 'ID_DOCUMENT', 'OTHER'];

export default function Documents() {
  const { hasMinRole } = useAuthStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => { fetchDocuments(); }, [categoryFilter]);

  async function fetchDocuments() {
    setLoading(true);
    try {
      const params = categoryFilter ? `?category=${categoryFilter}&limit=50` : '?limit=50';
      const { data } = await api.get<PaginatedResponse<Document>>(`/documents${params}`);
      setDocuments(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function isExpiringSoon(date?: string) {
    if (!date) return false;
    const diff = new Date(date).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  }

  const categoryIcons: Record<string, string> = {
    CONTRACT: '📄', WARNING: '⚠️', REQUEST: '📝', DECLARATION: '📋',
    CERTIFICATE: '🏅', POLICY: '📚', ID_DOCUMENT: '🪪', OTHER: '📎',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
        {hasMinRole('HR') && (
          <button className="btn-primary"><Upload className="w-4 h-4 mr-1" /> Upload</button>
        )}
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setCategoryFilter('')} className={`px-3 py-1.5 rounded-lg text-sm ${!categoryFilter ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 dark:bg-gray-700'}`}>
          All
        </button>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-3 py-1.5 rounded-lg text-sm ${categoryFilter === cat ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 dark:bg-gray-700'}`}>
            {categoryIcons[cat]} {cat}
          </button>
        ))}
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No documents found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="card p-4 flex items-center gap-4">
              <div className="text-2xl">{categoryIcons[doc.category] || '📎'}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{doc.title}</p>
                <p className="text-xs text-gray-500">{doc.fileName} - v{doc.version}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="badge badge-gray">{doc.category}</span>
                  {doc.isConfidential && <span className="badge badge-red">Confidential</span>}
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
