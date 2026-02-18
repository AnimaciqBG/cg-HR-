import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Break } from '../types';
import { Coffee, Play, Square, Timer, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const BREAK_CATEGORIES = [
  { value: 'LUNCH', label: 'Lunch Break (30 min)', icon: '🍽️', maxMin: 30 },
  { value: 'PERSONAL', label: 'Short Break (5 min)', icon: '☕', maxMin: 5 },
  { value: 'SMOKING', label: 'Smoking Break (5 min)', icon: '🚬', maxMin: 5 },
  { value: 'OTHER', label: 'Other', icon: '📋', maxMin: 5 },
];

const TOTAL_BREAK_MINUTES = 45;
const LUNCH_MINUTES = 30;
const SHORT_BREAK_MINUTES = 15;

export default function Breaks() {
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBreak, setActiveBreak] = useState<Break | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('LUNCH');
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [breakLimits, setBreakLimits] = useState<any>(null);

  useEffect(() => {
    fetchBreaks();
    fetchLimits();
  }, []);

  useEffect(() => {
    if (activeBreak) {
      const interval = setInterval(() => {
        const start = new Date(activeBreak.startTime).getTime();
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsed(0);
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

  async function fetchLimits() {
    try {
      const { data } = await api.get('/breaks/limits');
      setBreakLimits(data);
    } catch { /* ignore */ }
  }

  async function startBreak() {
    setActionLoading(true);
    try {
      const { data } = await api.post('/breaks/start', { category: selectedCategory });
      setActiveBreak(data);
      toast.success('Break started');
      fetchBreaks();
      fetchLimits();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to start break');
    }
    setActionLoading(false);
  }

  async function endBreak() {
    if (!activeBreak) return;
    setActionLoading(true);
    try {
      await api.post('/breaks/end', { breakId: activeBreak.id });
      setActiveBreak(null);
      setElapsed(0);
      toast.success('Break ended');
      fetchBreaks();
      fetchLimits();
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

  // Calculate used break time
  const completedBreaks = breaks.filter(b => b.status !== 'ACTIVE');
  const totalUsedMinutes = completedBreaks.reduce((sum, b) => sum + (b.duration || 0), 0);
  const lunchUsed = completedBreaks.filter(b => b.category === 'LUNCH').reduce((sum, b) => sum + (b.duration || 0), 0);
  const shortUsed = completedBreaks.filter(b => b.category !== 'LUNCH').reduce((sum, b) => sum + (b.duration || 0), 0);
  const currentBreakMin = Math.floor(elapsed / 60);
  const effectiveTotal = totalUsedMinutes + currentBreakMin;
  const remainingTotal = Math.max(0, TOTAL_BREAK_MINUTES - effectiveTotal);
  const remainingLunch = Math.max(0, LUNCH_MINUTES - lunchUsed - (activeBreak?.category === 'LUNCH' ? currentBreakMin : 0));
  const remainingShort = Math.max(0, SHORT_BREAK_MINUTES - shortUsed - (activeBreak && activeBreak.category !== 'LUNCH' ? currentBreakMin : 0));

  const statusColors: Record<string, string> = {
    ACTIVE: 'badge-green', COMPLETED: 'badge-blue', EXCEEDED: 'badge-red',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Break Tracking</h1>

      {/* Break Time Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <Clock className="w-5 h-5 text-primary-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-white">{remainingTotal} min</p>
          <p className="text-xs text-gray-400">Total Remaining</p>
          <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
            <div className="bg-primary-500 h-2 rounded-full transition-all" style={{ width: `${Math.max(0, (remainingTotal / TOTAL_BREAK_MINUTES) * 100)}%` }} />
          </div>
        </div>
        <div className="card p-4 text-center">
          <p className="text-lg font-bold text-white">{remainingLunch} min</p>
          <p className="text-xs text-gray-400">Lunch (30 min)</p>
          <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
            <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${(remainingLunch / LUNCH_MINUTES) * 100}%` }} />
          </div>
        </div>
        <div className="card p-4 text-center">
          <p className="text-lg font-bold text-white">{remainingShort} min</p>
          <p className="text-xs text-gray-400">Short Breaks (3x5 min)</p>
          <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
            <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${(remainingShort / SHORT_BREAK_MINUTES) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Active Break or Start */}
      <div className="card p-8 text-center">
        {activeBreak ? (
          <>
            <Coffee className="w-12 h-12 text-primary-400 mx-auto mb-3 animate-pulse" />
            <p className="text-lg font-semibold mb-1 text-white">Break in Progress</p>
            <p className="text-sm text-gray-400 mb-4">{BREAK_CATEGORIES.find(c => c.value === activeBreak.category)?.label || activeBreak.category}</p>
            <div className="text-5xl font-mono font-bold mb-6 text-primary-400">
              {formatDuration(elapsed)}
            </div>
            <button onClick={endBreak} disabled={actionLoading} className="btn-danger px-8 py-3">
              <Square className="w-5 h-5 mr-2" /> End Break
            </button>
          </>
        ) : (
          <>
            <Coffee className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-lg font-semibold mb-4 text-white">Start a Break</p>
            <div className="flex justify-center gap-2 mb-6 flex-wrap">
              {BREAK_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selectedCategory === cat.value
                      ? 'border-primary-500 bg-primary-900/40 text-primary-400'
                      : 'border-gray-700 hover:bg-gray-800 text-gray-400'
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
            <button onClick={startBreak} disabled={actionLoading || remainingTotal <= 0} className="btn-primary px-8 py-3">
              <Play className="w-5 h-5 mr-2" /> Start Break
            </button>
            {remainingTotal <= 0 && <p className="text-xs text-red-400 mt-2">All break time used for today</p>}
          </>
        )}
      </div>

      {/* Today's Breaks */}
      <div className="card p-6">
        <h2 className="font-semibold mb-4 text-white">Today's Breaks</h2>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div></div>
        ) : breaks.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No breaks today</p>
        ) : (
          <div className="space-y-2">
            {breaks.map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50">
                <span className="text-xl">{BREAK_CATEGORIES.find(c => c.value === b.category)?.icon || '📋'}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{BREAK_CATEGORIES.find(c => c.value === b.category)?.label || b.category}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(b.startTime).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                    {b.endTime && ` - ${new Date(b.endTime).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
                {b.duration != null && <span className="text-sm text-gray-400">{b.duration} min</span>}
                <span className={`badge ${statusColors[b.status] || 'badge-gray'}`}>{b.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
