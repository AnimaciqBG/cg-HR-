import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Announcement, PaginatedResponse } from '../types';
import { Megaphone, Pin, Plus, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function Announcements() {
  const { hasMinRole } = useAuthStore();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', priority: 'normal', isPinned: false });

  useEffect(() => { fetchAnnouncements(); }, []);

  async function fetchAnnouncements() {
    try {
      const { data } = await api.get<PaginatedResponse<Announcement>>('/announcements?limit=50');
      setAnnouncements(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/announcements', form);
      toast.success('Announcement published');
      setShowCreate(false);
      setForm({ title: '', content: '', priority: 'normal', isPinned: false });
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  }

  async function markRead(id: string) {
    try {
      await api.post(`/announcements/${id}/read`);
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
    } catch { /* ignore */ }
  }

  const priorityColors: Record<string, string> = {
    low: 'text-gray-500', normal: 'text-primary-400', high: 'text-orange-400', urgent: 'text-red-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold italic text-gradient-gold">Announcements</h1>
        {hasMinRole('TEAM_LEAD') && (
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
            <Plus className="w-4 h-4 mr-1" /> New Announcement
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold tracking-wide text-white">New Announcement</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="input-field" required />
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Content" className="input-field" rows={4} required />
            <div className="flex gap-4 items-center">
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input-field w-40">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} />
                Pin to top
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Publish</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 text-quantum-zinc">
          <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p>No announcements</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              onClick={() => !ann.isRead && markRead(ann.id)}
              className={`card p-5 cursor-pointer transition-colors ${!ann.isRead ? 'border-l-4 border-l-primary-500 bg-primary-900/10' : ''}`}
            >
              <div className="flex items-start gap-3">
                <Megaphone className={`w-5 h-5 mt-0.5 ${priorityColors[ann.priority] || 'text-gray-500'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{ann.title}</h3>
                    {ann.isPinned && <Pin className="w-4 h-4 text-primary-400" />}
                    {!ann.isRead && <span className="badge badge-blue">New</span>}
                  </div>
                  <p className="text-sm text-quantum-zinc mt-2 whitespace-pre-wrap">{ann.content}</p>
                  <p className="text-xs text-gray-600 mt-2">
                    {new Date(ann.publishedAt).toLocaleDateString('bg-BG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
