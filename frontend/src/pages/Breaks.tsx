import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Break } from '../types';
import { Coffee, Play, Square, Timer } from 'lucide-react';
import toast from 'react-hot-toast';

const BREAK_CATEGORIES = [
  { value: 'LUNCH', label: 'Lunch', icon: '🍽️' },
  { value: 'SMOKING', label: 'Smoking', icon: '🚬' },
  { value: 'PERSONAL', label: 'Personal', icon: '👤' },
  { value: 'DELIVERY', label: 'Delivery/Store', icon: '📦' },
  { value: 'OTHER', label: 'Other', icon: '📋' },
];

export default function Breaks() {
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBreak, setActiveBreak] = useState<Break | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('PERSONAL');
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    fetchBreaks();
  }, []);

  useEffect(() => {
    if (activeBreak) {
      const interval = setInterval(() => {
        const start = new Date(activeBreak.startTime).getTime();
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [activeBreak]);

  async function fetchBreaks() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await api.get(`/breaks?from=${today}&limit=50`);
      const list = data.data || [];
      setBreaks(list);
      const active = list.find((b: Break) => b.status === 'ACTIVE');
      setActiveBreak(active || null);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function startBreak() {
    setActionLoading(true);
    try {
      const { data } = await api.post('/breaks/start', { category: selectedCategory });
      setActiveBreak(data);
      toast.success('Break started');
      fetchBreaks();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to start break');
    }
    setActionLoading(false);
  }

  async function endBreak() {
    if (!activeBreak) return;
    setActionLoading(true);
    try {
      await api.post(`/breaks/${activeBreak.id}/end`);
      setActiveBreak(null);
      setElapsed(0);
      toast.success('Break ended');
      fetchBreaks();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to end break');
    }
    setActionLoading(false);
  }

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  const statusColors: Record<string, string> = {
    ACTIVE: 'badge-green', COMPLETED: 'badge-blue', EXCEEDED: 'badge-red',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Break Tracking</h1>

      {/* Active Break or Start */}
      <div className="card p-8 text-center">
        {activeBreak ? (
          <>
            <Coffee className="w-12 h-12 text-green-600 mx-auto mb-3 animate-pulse" />
            <p className="text-lg font-semibold mb-1">Break in Progress</p>
            <p className="text-sm text-gray-500 mb-4">{BREAK_CATEGORIES.find(c => c.value === activeBreak.category)?.label || activeBreak.category}</p>
            <div className="text-5xl font-mono font-bold mb-6 text-green-600">
              {formatDuration(elapsed)}
            </div>
            <button onClick={endBreak} disabled={actionLoading} className="btn-danger px-8 py-3">
              <Square className="w-5 h-5 mr-2" /> End Break
            </button>
          </>
        ) : (
          <>
            <Coffee className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-lg font-semibold mb-4">Start a Break</p>
            <div className="flex justify-center gap-2 mb-6 flex-wrap">
              {BREAK_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selectedCategory === cat.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
            <button onClick={startBreak} disabled={actionLoading} className="btn-primary px-8 py-3">
              <Play className="w-5 h-5 mr-2" /> Start Break
            </button>
          </>
        )}
      </div>

      {/* Today's Breaks */}
      <div className="card p-6">
        <h2 className="font-semibold mb-4">Today's Breaks</h2>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div></div>
        ) : breaks.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No breaks today</p>
        ) : (
          <div className="space-y-2">
            {breaks.map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-xl">{BREAK_CATEGORIES.find(c => c.value === b.category)?.icon || '📋'}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{BREAK_CATEGORIES.find(c => c.value === b.category)?.label || b.category}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(b.startTime).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                    {b.endTime && ` - ${new Date(b.endTime).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
                {b.duration && <span className="text-sm text-gray-600">{b.duration} min</span>}
                <span className={`badge ${statusColors[b.status] || 'badge-gray'}`}>{b.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
