import { useEffect, useState } from 'react';
import api from '../services/api';
import type { LeaveRequest, LeaveBalance, PaginatedResponse } from '../types';
import { Plus, Calendar, Check, X, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

const LEAVE_TYPES = ['PAID', 'UNPAID', 'SICK', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', 'OFFICIAL', 'STUDY', 'OTHER'];

export default function Leaves() {
  const { hasMinRole } = useAuthStore();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<'my' | 'pending'>('my');
  const [form, setForm] = useState({ leaveType: 'PAID', startDate: '', endDate: '', reason: '' });

  useEffect(() => { fetchData(); }, [tab]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = tab === 'pending' ? '?status=PENDING&limit=50' : '?limit=50';
      const [reqRes, balRes] = await Promise.all([
        api.get<PaginatedResponse<LeaveRequest>>(`/leaves${params}`),
        api.get('/leaves/balances'),
      ]);
      setRequests(reqRes.data.data || []);
      setBalances(Array.isArray(balRes.data) ? balRes.data : balRes.data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/leaves', form);
      toast.success('Leave request submitted');
      setShowCreate(false);
      setForm({ leaveType: 'PAID', startDate: '', endDate: '', reason: '' });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit request');
    }
  }

  async function handleApprove(id: string) {
    try {
      await api.post(`/leaves/${id}/approve`);
      toast.success('Leave approved');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    }
  }

  async function handleReject(id: string) {
    try {
      await api.post(`/leaves/${id}/reject`, { comment: 'Rejected' });
      toast.success('Leave rejected');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reject');
    }
  }

  const statusColors: Record<string, string> = {
    PENDING: 'badge-yellow', APPROVED_BY_LEAD: 'badge-blue', APPROVED_BY_HR: 'badge-blue',
    APPROVED: 'badge-green', REJECTED: 'badge-red', CANCELLED: 'badge-gray',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold italic text-gradient-gold">Leave Management</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          <Plus className="w-4 h-4 mr-1" /> Request Leave
        </button>
      </div>

      {/* Leave Balances */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {balances.map((b) => (
          <div key={b.id} className="card p-4">
            <p className="text-xs text-quantum-zinc uppercase">{b.leaveType}</p>
            <p className="text-2xl font-bold mt-1 text-white">{b.totalDays - b.usedDays - b.pendingDays}</p>
            <p className="text-xs text-quantum-zinc">of {b.totalDays} days left</p>
            <div className="w-full bg-white/[0.03] rounded-full h-1.5 mt-2">
              <div className="bg-primary-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, ((b.usedDays + b.pendingDays) / b.totalDays) * 100)}%` }}></div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="card p-6">
          <h2 className="font-semibold mb-4 tracking-wide text-white">New Leave Request</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-luxury">Leave Type</label>
              <select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="input-field mt-1">
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label-luxury">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input-field mt-1" required />
            </div>
            <div>
              <label className="label-luxury">End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input-field mt-1" required />
            </div>
            <div>
              <label className="label-luxury">Reason</label>
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="input-field mt-1" placeholder="Optional" />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">Submit Request</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(217, 176, 97, 0.08)' }}>
        <button onClick={() => setTab('my')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'my' ? 'border-primary-400 text-primary-400' : 'border-transparent text-quantum-zinc hover:text-gray-300'}`}>
          My Requests
        </button>
        {hasMinRole('TEAM_LEAD') && (
          <button onClick={() => setTab('pending')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'pending' ? 'border-primary-400 text-primary-400' : 'border-transparent text-quantum-zinc hover:text-gray-300'}`}>
            Pending Approvals
          </button>
        )}
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400"></div></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-8 text-quantum-zinc">No leave requests</div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-quantum-zinc" />
                  <div>
                    {req.employee && <p className="text-sm font-medium text-gray-200">{req.employee.firstName} {req.employee.lastName}</p>}
                    <p className="text-sm text-gray-300">{req.leaveType} - {req.totalDays} day(s)</p>
                    <p className="text-xs text-quantum-zinc">
                      {new Date(req.startDate).toLocaleDateString('bg-BG')} - {new Date(req.endDate).toLocaleDateString('bg-BG')}
                    </p>
                    {req.reason && <p className="text-xs text-gray-500 mt-1">{req.reason}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${statusColors[req.status] || 'badge-gray'}`}>{req.status}</span>
                  {tab === 'pending' && req.status === 'PENDING' && hasMinRole('TEAM_LEAD') && (
                    <div className="flex gap-1 ml-2">
                      <button onClick={() => handleApprove(req.id)} className="p-1.5 rounded-lg bg-green-900/40 text-green-400 hover:bg-green-900/60"><Check className="w-4 h-4" /></button>
                      <button onClick={() => handleReject(req.id)} className="p-1.5 rounded-lg bg-red-900/40 text-red-400 hover:bg-red-900/60"><X className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
