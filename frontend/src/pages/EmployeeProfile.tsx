import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import type { Employee } from '../types';
import {
  ArrowLeft, Mail, Phone, MapPin, Building2, Calendar,
  User, Edit, Camera, Clock, CheckCircle, XCircle, AlertCircle, History
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { ROLE_LABELS } from '../types';

interface ProfilePhoto {
  id: string;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  isActive: boolean;
  uploadedBy: string;
  createdAt: string;
  uploadedByUser?: { email: string; employee?: { firstName: string; lastName: string } | null } | null;
  reviewedByUser?: { email: string; employee?: { firstName: string; lastName: string } | null } | null;
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const { user: currentUser, hasPermission } = useAuthStore();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: '', personalEmail: '', address: '', emergencyContact: '', emergencyPhone: '' });

  // Photo state
  const [photoHistory, setPhotoHistory] = useState<ProfilePhoto[]>([]);
  const [showPhotoHistory, setShowPhotoHistory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSelf = currentUser?.employee?.id === id;
  const canUploadPhoto = isSelf || hasPermission('employees:write_all');

  useEffect(() => {
    loadEmployee();
    loadPhotoHistory();
  }, [id]);

  async function loadEmployee() {
    try {
      const { data } = await api.get(`/employees/${id}`);
      const emp = data.data || data;
      setEmployee(emp);
      setForm({
        phone: emp.phone || '', personalEmail: emp.personalEmail || '',
        address: emp.address || '', emergencyContact: emp.emergencyContact || '',
        emergencyPhone: emp.emergencyPhone || '',
      });
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadPhotoHistory() {
    try {
      const { data } = await api.get(`/photos/history/${id}`);
      setPhotoHistory(data.data || []);
    } catch { /* ignore */ }
  }

  async function handleSave() {
    try {
      const { data } = await api.put(`/employees/${id}`, form);
      const emp = data.data || data;
      setEmployee(emp);
      setEditing(false);
    } catch { /* ignore */ }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Only JPEG, PNG, and WebP are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File must be under 5MB');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('photo', file);
      await api.post(`/photos/upload/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadEmployee();
      await loadPhotoHistory();
      setShowPhotoHistory(true);
    } catch (err: any) {
      setUploadError(err.response?.data?.error || 'Failed to upload photo');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const pendingPhotos = photoHistory.filter(p => p.status === 'PENDING');
  const hasPendingPhoto = pendingPhotos.length > 0;

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
          {/* Photo + Upload */}
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl bg-primary-900/40 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {employee.photoUrl ? (
                <img src={employee.photoUrl} alt="" className="w-24 h-24 rounded-2xl object-cover" />
              ) : (
                <User className="w-12 h-12 text-primary-400" />
              )}
            </div>
            {canUploadPhoto && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                {uploading ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            {hasPendingPhoto && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
                <Clock className="w-3 h-3 text-black" />
              </div>
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

            {uploadError && (
              <p className="text-sm text-red-400 mt-2 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {uploadError}
              </p>
            )}
            {hasPendingPhoto && (
              <p className="text-sm text-yellow-400 mt-2 flex items-center gap-1">
                <Clock className="w-4 h-4" /> Photo pending approval
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setShowPhotoHistory(!showPhotoHistory); if (!showPhotoHistory) loadPhotoHistory(); }}
              className="btn-secondary text-xs"
            >
              <History className="w-4 h-4 mr-1" /> Photos
            </button>
            <button onClick={() => setEditing(!editing)} className="btn-secondary">
              <Edit className="w-4 h-4 mr-1" /> Edit
            </button>
          </div>
        </div>
      </div>

      {/* Photo History Panel */}
      {showPhotoHistory && (
        <div className="card p-6">
          <h3 className="font-semibold mb-4 text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary-400" /> Photo History
          </h3>
          {photoHistory.length === 0 ? (
            <p className="text-gray-500 text-sm">No photos uploaded yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {photoHistory.map((photo) => (
                <div key={photo.id} className="relative group">
                  <div className="aspect-square rounded-xl overflow-hidden bg-gray-800 border border-gray-700">
                    <img src={photo.fileUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                    photo.status === 'APPROVED' ? 'bg-green-900/80 text-green-300' :
                    photo.status === 'REJECTED' ? 'bg-red-900/80 text-red-300' :
                    'bg-yellow-900/80 text-yellow-300'
                  }`}>
                    {photo.status === 'APPROVED' && <CheckCircle className="w-3 h-3 inline mr-0.5" />}
                    {photo.status === 'REJECTED' && <XCircle className="w-3 h-3 inline mr-0.5" />}
                    {photo.status === 'PENDING' && <Clock className="w-3 h-3 inline mr-0.5" />}
                    {photo.status}
                  </div>
                  {photo.isActive && (
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs font-medium bg-primary-900/80 text-primary-300">
                      Active
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-xl bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                    <p className="text-xs text-gray-300">{new Date(photo.createdAt).toLocaleDateString('bg-BG')}</p>
                    {photo.uploadedByUser && (
                      <p className="text-xs text-gray-400">
                        By: {photo.uploadedByUser.employee ? `${photo.uploadedByUser.employee.firstName} ${photo.uploadedByUser.employee.lastName}` : photo.uploadedByUser.email}
                      </p>
                    )}
                    {photo.reviewedByUser && (
                      <p className="text-xs text-gray-400">
                        Reviewed: {photo.reviewedByUser.employee ? `${photo.reviewedByUser.employee.firstName} ${photo.reviewedByUser.employee.lastName}` : photo.reviewedByUser.email}
                      </p>
                    )}
                    {photo.reviewComment && (
                      <p className="text-xs text-red-400 mt-1">"{photo.reviewComment}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              {employee.personalEmail && (
                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-500" /> <span className="text-sm text-gray-300">{employee.personalEmail}</span> <span className="text-xs text-gray-600">(personal)</span></div>
              )}
              {employee.address && (
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-500" /> <span className="text-sm text-gray-300">{employee.address}</span></div>
              )}
              {employee.emergencyContact && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-gray-300">{employee.emergencyContact} {employee.emergencyPhone && `(${employee.emergencyPhone})`}</span>
                </div>
              )}
              {!employee.user?.email && !employee.phone && !employee.address && (
                <p className="text-sm text-gray-500">No contact info added</p>
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
            <div className="flex justify-between">
              <dt className="text-gray-400">Role</dt>
              <dd><span className="badge badge-blue">{ROLE_LABELS[employee.user?.role as keyof typeof ROLE_LABELS] || employee.user?.role}</span></dd>
            </div>
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
