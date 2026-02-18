import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type { Employee, PaginatedResponse, UserRole } from '../types';
import { ROLE_LABELS, JOB_POSITIONS } from '../types';
import { Search, Plus, Filter, ChevronLeft, ChevronRight, MapPin, User, Trash2, X, Copy, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const specials = '!@#$%&*';
  let pass = '';
  for (let i = 0; i < 12; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  pass += specials[Math.floor(Math.random() * specials.length)];
  pass += Math.floor(Math.random() * 10);
  return pass;
}

function generateEmail(first: string, last: string): string {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  return `${normalize(first)}.${normalize(last)}@cinegrand.bg`;
}

export default function Employees() {
  const { hasMinRole, user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', jobTitle: JOB_POSITIONS[JOB_POSITIONS.length - 1],
    role: 'EMPLOYEE' as UserRole, phone: '',
  });

  useEffect(() => { fetchEmployees(); }, [searchParams]);

  async function fetchEmployees() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const s = searchParams.get('search');
      if (s) params.set('search', s);
      params.set('page', searchParams.get('page') || '1');
      params.set('limit', '20');
      const { data } = await api.get<PaginatedResponse<Employee>>(`/employees?${params}`);
      setEmployees(data.data);
      setMeta({ total: data.meta.total, page: data.meta.page, totalPages: data.meta.totalPages });
    } catch { /* ignore */ }
    setLoading(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams({ search, page: '1' });
  }

  function changePage(newPage: number) {
    setSearchParams({ search, page: String(newPage) });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const email = generateEmail(form.firstName, form.lastName);
    const password = generatePassword();
    try {
      await api.post('/users', {
        email,
        password,
        role: form.role,
        firstName: form.firstName,
        lastName: form.lastName,
        jobTitle: form.jobTitle,
        phone: form.phone || undefined,
      });
      setCreatedCreds({ email, password });
      toast.success('Employee created successfully');
      fetchEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create employee');
    }
    setCreating(false);
  }

  async function handleDelete(empId: string, name: string) {
    if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) return;
    try {
      await api.delete(`/employees/${empId}`);
      toast.success('Employee removed');
      fetchEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  }

  function copyCredentials() {
    if (!createdCreds) return;
    navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const statusColors: Record<string, string> = {
    ACTIVE: 'badge-green', ON_PROBATION: 'badge-yellow', ON_LEAVE: 'badge-blue',
    TERMINATED: 'badge-red', RESIGNED: 'badge-gray',
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="text-gray-400 text-sm mt-1">{meta.total} employees</p>
        </div>
        {isSuperAdmin && (
          <button onClick={() => { setShowCreate(true); setCreatedCreds(null); }} className="btn-primary">
            <Plus className="w-4 h-4 mr-2" /> Add Employee
          </button>
        )}
      </div>

      {/* Create Employee Modal */}
      {showCreate && (
        <div className="card p-6">
          {createdCreds ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Employee Created!</h3>
                <button onClick={() => { setShowCreate(false); setCreatedCreds(null); setForm({ firstName: '', lastName: '', jobTitle: JOB_POSITIONS[JOB_POSITIONS.length - 1], role: 'EMPLOYEE', phone: '' }); }} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg space-y-2">
                <p className="text-sm text-gray-400">Save these credentials - the password will not be shown again!</p>
                <p className="text-sm"><span className="text-gray-400">Email:</span> <span className="text-primary-400 font-mono">{createdCreds.email}</span></p>
                <p className="text-sm"><span className="text-gray-400">Password:</span> <span className="text-primary-400 font-mono">{createdCreds.password}</span></p>
              </div>
              <button onClick={copyCredentials} className="btn-secondary">
                {copied ? <><Check className="w-4 h-4 mr-1" /> Copied!</> : <><Copy className="w-4 h-4 mr-1" /> Copy Credentials</>}
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">New Employee</h3>
                <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300">First Name</label>
                  <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input-field mt-1" required />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Last Name</label>
                  <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input-field mt-1" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300">Position</label>
                  <select value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className="input-field mt-1">
                    {JOB_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className="input-field mt-1">
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-300">Phone (optional)</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-field mt-1" />
              </div>
              {form.firstName && form.lastName && (
                <p className="text-xs text-gray-500">Email will be: <span className="text-primary-400">{generateEmail(form.firstName, form.lastName)}</span></p>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create Employee'}</button>
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, title, number..." className="input-field pl-10" />
          </div>
          <button type="submit" className="btn-primary">
            <Filter className="w-4 h-4 mr-1" /> Search
          </button>
        </form>
      </div>

      {/* Employee List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp) => (
            <div key={emp.id} className="card p-4 hover:border-primary-700/50 transition-colors">
              <Link to={`/employees/${emp.id}`} className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                  {emp.photoUrl ? (
                    <img src={emp.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-primary-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-white truncate">{emp.firstName} {emp.lastName}</p>
                  <p className="text-xs text-gray-400 truncate">{emp.jobTitle}</p>
                  {emp.location && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <MapPin className="w-3 h-3" /> {emp.location.name}
                    </span>
                  )}
                  <span className={`badge mt-2 ${statusColors[emp.employmentStatus] || 'badge-gray'}`}>
                    {emp.employmentStatus}
                  </span>
                </div>
              </Link>
              {isSuperAdmin && (
                <button onClick={() => handleDelete(emp.id, `${emp.firstName} ${emp.lastName}`)} className="mt-2 text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button onClick={() => changePage(meta.page - 1)} disabled={meta.page <= 1} className="btn-secondary p-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-400">Page {meta.page} of {meta.totalPages}</span>
          <button onClick={() => changePage(meta.page + 1)} disabled={meta.page >= meta.totalPages} className="btn-secondary p-2">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
