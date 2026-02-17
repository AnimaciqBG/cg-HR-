import { useEffect, useState } from 'react';
import api from '../services/api';
import { Clock, LogIn, LogOut, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface TimeEntry {
  id: string;
  type: string;
  timestamp: string;
  isManual: boolean;
  notes?: string;
}

export default function TimeTracking() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchEntries();
  }, []);

  async function fetchEntries() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await api.get(`/time-entries?from=${today}&limit=50`);
      const list = data.data || [];
      setEntries(list);
      // Determine if clocked in
      const lastEntry = list[0];
      setClockedIn(lastEntry?.type === 'CLOCK_IN');
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleClockIn() {
    setActionLoading(true);
    try {
      await api.post('/time-entries/clock-in');
      toast.success('Clocked in successfully');
      setClockedIn(true);
      fetchEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to clock in');
    }
    setActionLoading(false);
  }

  async function handleClockOut() {
    setActionLoading(true);
    try {
      await api.post('/time-entries/clock-out');
      toast.success('Clocked out successfully');
      setClockedIn(false);
      fetchEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to clock out');
    }
    setActionLoading(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Time & Attendance</h1>

      {/* Clock In/Out Card */}
      <div className="card p-8 text-center">
        <div className="text-5xl font-mono font-bold mb-4">
          {new Date().toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {new Date().toLocaleDateString('bg-BG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <div className="flex justify-center gap-4">
          {!clockedIn ? (
            <button onClick={handleClockIn} disabled={actionLoading} className="btn-primary px-8 py-3 text-lg">
              <LogIn className="w-5 h-5 mr-2" /> Clock In
            </button>
          ) : (
            <button onClick={handleClockOut} disabled={actionLoading} className="btn-danger px-8 py-3 text-lg">
              <LogOut className="w-5 h-5 mr-2" /> Clock Out
            </button>
          )}
        </div>

        <p className={`text-sm mt-4 ${clockedIn ? 'text-green-600' : 'text-gray-500'}`}>
          {clockedIn ? 'You are currently clocked in' : 'You are not clocked in'}
        </p>
      </div>

      {/* Today's Entries */}
      <div className="card p-6">
        <h2 className="font-semibold mb-4">Today's Time Entries</h2>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div></div>
        ) : entries.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No entries today</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className={`p-2 rounded-lg ${entry.type === 'CLOCK_IN' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  {entry.type === 'CLOCK_IN' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{entry.type.replace('_', ' ')}</p>
                  <p className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleTimeString('bg-BG')}</p>
                </div>
                {entry.isManual && (
                  <span className="badge badge-yellow ml-auto">Manual</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
