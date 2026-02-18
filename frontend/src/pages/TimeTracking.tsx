import { useEffect, useState } from 'react';
import api from '../services/api';
import { Clock, LogIn, LogOut, AlertCircle, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

interface TimeEntry {
  id: string;
  type: string;
  timestamp: string;
  isManual: boolean;
  notes?: string;
}

interface TodayShift {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  template?: { name: string; color: string };
}

export default function TimeTracking() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [todayShift, setTodayShift] = useState<TodayShift | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchEntries();
    fetchTodayShift();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function fetchEntries() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await api.get(`/time-entries?from=${today}&limit=50`);
      const list = data.data || [];
      setEntries(list);
      const lastEntry = list[0];
      setClockedIn(lastEntry?.type === 'CLOCK_IN');
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function fetchTodayShift() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await api.get(`/shifts?dateFrom=${today}&dateTo=${today}&limit=5`);
      const myShift = (data.data || [])[0];
      setTodayShift(myShift || null);
    } catch { /* ignore */ }
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

  // Check if within 30 min of shift start/end
  const canClockIn = () => {
    if (!todayShift) return false;
    const now = Date.now();
    const shiftStart = new Date(todayShift.startTime).getTime();
    const shiftEnd = new Date(todayShift.endTime).getTime();
    const GRACE_MS = 30 * 60 * 1000;
    return now >= (shiftStart - GRACE_MS) && now <= (shiftEnd + GRACE_MS);
  };

  const shiftStartStr = todayShift ? new Date(todayShift.startTime).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) : '';
  const shiftEndStr = todayShift ? new Date(todayShift.endTime).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Time & Attendance</h1>

      {/* Today's Shift Info */}
      {todayShift ? (
        <div className="card p-4 flex items-center gap-4">
          <Calendar className="w-6 h-6 text-primary-400" />
          <div>
            <p className="text-sm font-medium text-white">Today's Shift: {shiftStartStr} - {shiftEndStr}</p>
            <p className="text-xs text-gray-400">{todayShift.template?.name || 'Custom Shift'}</p>
          </div>
          <span className="badge badge-green ml-auto">Scheduled</span>
        </div>
      ) : (
        <div className="card p-4 flex items-center gap-4">
          <AlertCircle className="w-6 h-6 text-yellow-400" />
          <p className="text-sm text-yellow-400">No shift scheduled for today</p>
        </div>
      )}

      {/* Clock In/Out Card */}
      <div className="card p-8 text-center">
        <div className="text-5xl font-mono font-bold mb-4 text-white">
          {currentTime.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <p className="text-gray-400 mb-6">
          {currentTime.toLocaleDateString('bg-BG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <div className="flex justify-center gap-4">
          {!clockedIn ? (
            <button
              onClick={handleClockIn}
              disabled={actionLoading || (!todayShift || !canClockIn())}
              className="btn-primary px-8 py-3 text-lg"
            >
              <LogIn className="w-5 h-5 mr-2" /> Clock In
            </button>
          ) : (
            <button onClick={handleClockOut} disabled={actionLoading} className="btn-danger px-8 py-3 text-lg">
              <LogOut className="w-5 h-5 mr-2" /> Clock Out
            </button>
          )}
        </div>

        {!clockedIn && todayShift && !canClockIn() && (
          <p className="text-sm text-yellow-400 mt-4">
            You can clock in starting 30 minutes before your shift ({shiftStartStr})
          </p>
        )}

        <p className={`text-sm mt-4 ${clockedIn ? 'text-green-400' : 'text-gray-500'}`}>
          {clockedIn ? 'You are currently clocked in' : 'You are not clocked in'}
        </p>
      </div>

      {/* Today's Entries */}
      <div className="card p-6">
        <h2 className="font-semibold mb-4 text-white">Today's Time Entries</h2>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div></div>
        ) : entries.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No entries today</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50">
                <div className={`p-2 rounded-lg ${entry.type === 'CLOCK_IN' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                  {entry.type === 'CLOCK_IN' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{entry.type.replace('_', ' ')}</p>
                  <p className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleTimeString('bg-BG')}</p>
                </div>
                {entry.isManual && <span className="badge badge-yellow ml-auto">Manual</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
