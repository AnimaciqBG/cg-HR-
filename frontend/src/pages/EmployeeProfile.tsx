import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import type { Employee } from '../types';
import { ArrowLeft, Mail, Phone, MapPin, Building2, Calendar, Briefcase, User, Edit } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function EmployeeProfile() {
  const { id } = useParams();
  const { hasMinRole } = useAuthStore();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: '', personalEmail: '', address: '', emergencyContact: '', emergencyPhone: '' });

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get(`/employees/${id}`);
        setEmployee(data);
        setForm({
          phone: data.phone || '', personalEmail: data.personalEmail || '',
          address: data.address || '', emergencyContact: data.emergencyContact || '',
          emergencyPhone: data.emergencyPhone || '',
        });
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleSave() {
    try {
      const { data } = await api.put(`/employees/${id}`, form);
      setEmployee(data);
      setEditing(false);
    } catch { /* ignore */ }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400"></div></div>;
  }

  if (!employee) {
    return <div className="text-center py-12"><p className="text-gray-400">Employee not found</p></div>;
  }

  const statusColors: Record<string, string> = {
    ACTIVE: 'badge-green', ON_PROBATION: 'badge-yellow', ON_LEAVE: 'badge-blue',
    TERMINATED: 'badge-red', RESIGNED: 'badge-gray',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/employees" className="p-2 rounded-lg hover:bg-gray-700 text-gray-300">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Employee Profile</h1>
      </div>

      {/* Header Card */}
      <div className="card p-6">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-2xl bg-primary-900/40 flex items-center justify-center flex-shrink-0">
            {employee.photoUrl ? (
              <img src={employee.photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover" />
            ) : (
              <User className="w-10 h-10 text-primary-400" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{employee.firstName} {employee.lastName}</h2>
              <span className={`badge ${statusColors[employee.employmentStatus] || 'badge-gray'}`}>
                {employee.employmentStatus}
              </span>
            </div>
            <p className="text-gray-400">{employee.jobTitle}</p>
            <p className="text-xs text-gray-500 mt-1">#{employee.employeeNumber}</p>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
              {employee.department && (
                <span className="flex items-center gap-1"><Building2 className="w-4 h-4" /> {employee.department.name}</span>
              )}
              {employee.location && (
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {employee.location.name}</span>
              )}
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Hired: {new Date(employee.hireDate).toLocaleDateString('bg-BG')}</span>
            </div>
          </div>
          <button onClick={() => setEditing(!editing)} className="btn-secondary">
            <Edit className="w-4 h-4 mr-1" /> Edit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Info */}
        <div className="card p-6">
          <h3 className="font-semibold mb-4 text-white">Contact Information</h3>
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400">Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Personal Email</label>
                <input value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Emergency Contact</label>
                <input value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Emergency Phone</label>
                <input value={form.emergencyPhone} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })} className="input-field" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} className="btn-primary">Save</button>
                <button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {employee.user?.email && (
                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-500" /> <span className="text-sm text-gray-300">{employee.user.email}</span></div>
              )}
              {employee.phone && (
                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-500" /> <span className="text-sm text-gray-300">{employee.phone}</span></div>
              )}
              {employee.address && (
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-500" /> <span className="text-sm text-gray-300">{employee.address}</span></div>
              )}
            </div>
          )}
        </div>

        {/* Work Details */}
        <div className="card p-6">
          <h3 className="font-semibold mb-4 text-white">Work Details</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-gray-400">Contract</dt><dd className="font-medium text-gray-300">{employee.contractType}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-400">Weekly Hours</dt><dd className="font-medium text-gray-300">{employee.weeklyHours}h</dd></div>
            {employee.manager && (
              <div className="flex justify-between"><dt className="text-gray-400">Manager</dt><dd className="font-medium text-gray-300">{employee.manager.firstName} {employee.manager.lastName}</dd></div>
            )}
            {employee.probationEndDate && (
              <div className="flex justify-between"><dt className="text-gray-400">Probation Ends</dt><dd className="font-medium text-gray-300">{new Date(employee.probationEndDate).toLocaleDateString('bg-BG')}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-gray-400">Role</dt><dd><span className="badge badge-blue">{employee.user?.role}</span></dd></div>
          </dl>
        </div>

        {/* Manager & Team */}
        {employee.subordinates && employee.subordinates.length > 0 && (
          <div className="card p-6 lg:col-span-2">
            <h3 className="font-semibold mb-4 text-white">Direct Reports ({employee.subordinates.length})</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {employee.subordinates.map((sub) => (
                <Link key={sub.id} to={`/employees/${sub.id}`} className="p-3 rounded-lg border border-gray-700 hover:bg-gray-700">
                  <p className="font-medium text-sm text-gray-200">{sub.firstName} {sub.lastName}</p>
                  <p className="text-xs text-gray-500">{(sub as any).jobTitle}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
