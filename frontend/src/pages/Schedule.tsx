import { useEffect, useState } from 'react';
import api from '../services/api';
import type { Shift } from '../types';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function Schedule() {
  const { hasMinRole } = useAuthStore();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; color: string; startTime: string; endTime: string }[]>([]);
  const [shiftForm, setShiftForm] = useState({
    employeeId: '', date: '', startTime: '', endTime: '', templateId: '', notes: '',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0

  const monthName = currentDate.toLocaleDateString('bg-BG', { month: 'long', year: 'numeric' });

  useEffect(() => { fetchShifts(); }, [currentDate]);
  useEffect(() => {
    if (showCreate) {
      api.get('/employees?limit=100').then(({ data }) => setEmployees(data.data || [])).catch(() => {});
      api.get('/shifts/templates').then(({ data }) => setTemplates(data || [])).catch(() => {});
    }
  }, [showCreate]);

  async function fetchShifts() {
    setLoading(true);
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;
    try {
      const { data } = await api.get(`/shifts?dateFrom=${from}&dateTo=${to}&limit=500`);
      setShifts(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function getShiftsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return shifts.filter(s => s.date.startsWith(dateStr));
  }

  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const dateStr = shiftForm.date;
      const startTime = `${dateStr}T${shiftForm.startTime}:00`;
      const endTime = shiftForm.endTime < shiftForm.startTime
        ? `${dateStr.replace(/\d{2}$/, String(parseInt(dateStr.slice(-2)) + 1).padStart(2, '0'))}T${shiftForm.endTime}:00`
        : `${dateStr}T${shiftForm.endTime}:00`;

      await api.post('/shifts', {
        employeeId: shiftForm.employeeId || undefined,
        templateId: shiftForm.templateId || undefined,
        date: dateStr,
        startTime,
        endTime,
        notes: shiftForm.notes || undefined,
      });
      toast.success('Shift created');
      setShowCreate(false);
      setShiftForm({ employeeId: '', date: '', startTime: '', endTime: '', templateId: '', notes: '' });
      fetchShifts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create shift');
    }
    setCreating(false);
  }

  function onTemplateSelect(templateId: string) {
    const t = templates.find(t => t.id === templateId);
    if (t) {
      setShiftForm({ ...shiftForm, templateId, startTime: t.startTime, endTime: t.endTime });
    } else {
      setShiftForm({ ...shiftForm, templateId });
    }
  }

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold italic text-gradient-gold">Schedule</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="btn-secondary p-2"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setCurrentDate(new Date())} className="btn-secondary px-3 py-2 text-sm">Today</button>
            <button onClick={nextMonth} className="btn-secondary p-2"><ChevronRight className="w-4 h-4" /></button>
          </div>
          {hasMinRole('TEAM_LEAD') && (
            <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
              <Plus className="w-4 h-4 mr-1" /> Add Shift
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-quantum-zinc tracking-wide capitalize">{monthName}</p>

      {/* Create Shift Form */}
      {showCreate && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold tracking-wide text-white">Create Shift</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleCreateShift} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-luxury">Employee</label>
                <select value={shiftForm.employeeId} onChange={(e) => setShiftForm({ ...shiftForm, employeeId: e.target.value })} className="input-field mt-1">
                  <option value="">Open Shift</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="label-luxury">Template</label>
                <select value={shiftForm.templateId} onChange={(e) => onTemplateSelect(e.target.value)} className="input-field mt-1">
                  <option value="">Custom</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.startTime}-{t.endTime})</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label-luxury">Date</label>
                <input type="date" value={shiftForm.date} onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })} className="input-field mt-1" required />
              </div>
              <div>
                <label className="label-luxury">Start Time</label>
                <input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} className="input-field mt-1" required />
              </div>
              <div>
                <label className="label-luxury">End Time</label>
                <input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} className="input-field mt-1" required />
              </div>
            </div>
            <div>
              <label className="label-luxury">Notes</label>
              <input value={shiftForm.notes} onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })} className="input-field mt-1" placeholder="Optional notes" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create Shift'}</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Monthly Calendar Grid */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {dayNames.map(d => (
              <div key={d} className="text-center text-xs font-medium text-quantum-zinc py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before month starts */}
            {Array.from({ length: firstDayOfWeek }, (_, i) => (
              <div key={`empty-${i}`} className="min-h-[100px] bg-white/[0.02] rounded-2xl" />
            ))}
            {/* Days of the month */}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayShifts = getShiftsForDay(day);
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              return (
                <div key={day} className={`min-h-[100px] card p-1.5 ${isToday ? 'ring-1 ring-primary-500' : ''}`}>
                  <p className={`text-xs font-bold mb-1 ${isToday ? 'text-primary-400' : 'text-gray-400'}`}>{day}</p>
                  <div className="space-y-0.5">
                    {dayShifts.slice(0, 3).map((shift) => (
                      <div
                        key={shift.id}
                        className="px-1 py-0.5 rounded text-[10px] leading-tight truncate"
                        style={{ backgroundColor: shift.template?.color ? `${shift.template.color}30` : '#374151', borderLeft: `2px solid ${shift.template?.color || '#6b7280'}` }}
                      >
                        <span className="text-gray-300">
                          {shift.employee ? `${shift.employee.firstName} ${shift.employee.lastName?.charAt(0)}.` : 'Open'}
                        </span>
                      </div>
                    ))}
                    {dayShifts.length > 3 && <p className="text-[10px] text-quantum-zinc">+{dayShifts.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
