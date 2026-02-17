import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Shift } from '../types';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Schedule() {
  const { hasMinRole } = useAuthStore();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);

  const weekStart = getWeekStart(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  useEffect(() => {
    fetchShifts();
  }, [currentDate]);

  async function fetchShifts() {
    setLoading(true);
    const from = days[0].toISOString().split('T')[0];
    const to = days[6].toISOString().split('T')[0];
    try {
      const { data } = await api.get(`/shifts?dateFrom=${from}&dateTo=${to}&limit=100`);
      setShifts(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function getWeekStart(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function prevWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  }

  function nextWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  }

  function getShiftsForDay(date: Date) {
    const dateStr = date.toISOString().split('T')[0];
    return shifts.filter(s => s.date.startsWith(dateStr));
  }

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="btn-secondary p-2"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setCurrentDate(new Date())} className="btn-secondary px-3 py-2 text-sm">Today</button>
            <button onClick={nextWeek} className="btn-secondary p-2"><ChevronRight className="w-4 h-4" /></button>
          </div>
          {hasMinRole('TEAM_LEAD') && (
            <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
              <Plus className="w-4 h-4 mr-1" /> Add Shift
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        Week of {days[0].toLocaleDateString('bg-BG', { month: 'long', day: 'numeric' })} - {days[6].toLocaleDateString('bg-BG', { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>

      {/* Week Grid */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, i) => {
            const dayShifts = getShiftsForDay(day);
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <div key={i} className={`card p-3 min-h-[200px] ${isToday ? 'ring-2 ring-primary-500' : ''}`}>
                <div className="text-center mb-3">
                  <p className="text-xs text-gray-500 uppercase">{dayNames[i]}</p>
                  <p className={`text-lg font-bold ${isToday ? 'text-primary-600' : ''}`}>{day.getDate()}</p>
                </div>
                <div className="space-y-1.5">
                  {dayShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="p-2 rounded-md text-xs"
                      style={{ backgroundColor: shift.template?.color ? `${shift.template.color}20` : '#e5e7eb', borderLeft: `3px solid ${shift.template?.color || '#6b7280'}` }}
                    >
                      <p className="font-medium truncate">
                        {shift.employee ? `${shift.employee.firstName} ${shift.employee.lastName?.charAt(0)}.` : 'Open Shift'}
                      </p>
                      <p className="text-gray-500 mt-0.5">
                        {new Date(shift.startTime).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })} -
                        {new Date(shift.endTime).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                  {dayShifts.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No shifts</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
