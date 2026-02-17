import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type { Employee, PaginatedResponse } from '../types';
import { Search, Plus, Filter, ChevronLeft, ChevronRight, MapPin, Building2, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Employees() {
  const { hasMinRole } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get('/admin/departments').then(({ data }) => setDepartments(data)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [searchParams]);

  async function fetchEmployees() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (departmentFilter) params.set('departmentId', departmentFilter);
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

  const statusColors: Record<string, string> = {
    ACTIVE: 'badge-green', ON_PROBATION: 'badge-yellow', ON_LEAVE: 'badge-blue',
    TERMINATED: 'badge-red', RESIGNED: 'badge-gray',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{meta.total} employees</p>
        </div>
        {hasMinRole('HR') && (
          <Link to="/admin" className="btn-primary">
            <Plus className="w-4 h-4 mr-2" /> Add Employee
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, title, number..." className="input-field pl-10"
            />
          </div>
          <select
            value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
            className="input-field w-48"
          >
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button type="submit" className="btn-primary">
            <Filter className="w-4 h-4 mr-1" /> Filter
          </button>
        </form>
      </div>

      {/* Employee List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp) => (
            <Link key={emp.id} to={`/employees/${emp.id}`} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0">
                  {emp.photoUrl ? (
                    <img src={emp.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-primary-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{emp.firstName} {emp.lastName}</p>
                  <p className="text-xs text-gray-500 truncate">{emp.jobTitle}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    {emp.department && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {emp.department.name}
                      </span>
                    )}
                    {emp.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {emp.location.name}
                      </span>
                    )}
                  </div>
                  <span className={`badge mt-2 ${statusColors[emp.employmentStatus] || 'badge-gray'}`}>
                    {emp.employmentStatus}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button onClick={() => changePage(meta.page - 1)} disabled={meta.page <= 1} className="btn-secondary p-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm">Page {meta.page} of {meta.totalPages}</span>
          <button onClick={() => changePage(meta.page + 1)} disabled={meta.page >= meta.totalPages} className="btn-secondary p-2">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
