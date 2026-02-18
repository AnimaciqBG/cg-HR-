export type UserRole = 'EMPLOYEE' | 'TEAM_LEAD' | 'HR' | 'ADMIN' | 'PAYROLL_ADMIN' | 'SUPER_ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_ACTIVATION';
export type EmploymentStatus = 'ACTIVE' | 'ON_PROBATION' | 'ON_LEAVE' | 'TERMINATED' | 'RESIGNED';
export type ContractType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'TEMPORARY';
export type LeaveType = 'PAID' | 'UNPAID' | 'SICK' | 'MATERNITY' | 'PATERNITY' | 'BEREAVEMENT' | 'OFFICIAL' | 'STUDY' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED_BY_LEAD' | 'APPROVED_BY_HR' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ShiftStatus = 'SCHEDULED' | 'OPEN' | 'SWAP_PENDING' | 'COMPLETED' | 'CANCELLED';
export type BreakCategory = 'LUNCH' | 'SMOKING' | 'PERSONAL' | 'DELIVERY' | 'OTHER';
export type BreakStatus = 'ACTIVE' | 'COMPLETED' | 'EXCEEDED';
export type GoalStatus = 'NOT_STARTED' | 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'COMPLETED' | 'CANCELLED';
export type ReviewStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'ACKNOWLEDGED';

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Main Manager',
  ADMIN: 'Deputy Manager',
  HR: 'Administrator',
  PAYROLL_ADMIN: 'Senior Team Lead',
  TEAM_LEAD: 'Team Leader',
  EMPLOYEE: 'Employee',
};

export const JOB_POSITIONS = [
  'Main Manager',
  'Deputy Manager',
  'Administrator',
  'Senior Team Leader',
  'Team Leader',
  'Senior Assistant Seller',
  'Assistant Seller',
];

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  employee?: EmployeeSummary;
  permissions?: string[];
}

export interface PermissionOverride {
  permission: string;
  granted: boolean;
}

export interface PermissionMatrixEntry {
  user: {
    id: string;
    email: string;
    role: UserRole;
    employee?: { firstName: string; lastName: string; jobTitle: string } | null;
  };
  rolePermissions: string[];
  overrides: Record<string, boolean>;
  effectivePermissions: string[];
}

export interface PermissionCatalog {
  permissions: string[];
  categories: Record<string, string[]>;
  roles: string[];
  roleDefaults: Record<string, string[]>;
}

export interface EmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  photoUrl?: string;
  department?: { id: string; name: string };
  location?: { id: string; name: string };
}

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
  personalEmail?: string;
  address?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  photoUrl?: string;
  jobTitle: string;
  departmentId?: string;
  locationId?: string;
  managerId?: string;
  contractType: ContractType;
  employmentStatus: EmploymentStatus;
  hireDate: string;
  probationEndDate?: string;
  weeklyHours: number;
  salary?: number;
  hourlyRate?: number;
  currency: string;
  department?: { id: string; name: string };
  location?: { id: string; name: string };
  manager?: { id: string; firstName: string; lastName: string };
  subordinates?: { id: string; firstName: string; lastName: string }[];
  user?: { id: string; email: string; role: UserRole; status: UserStatus };
}

export interface Shift {
  id: string;
  employeeId?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ShiftStatus;
  isOpenShift: boolean;
  notes?: string;
  employee?: EmployeeSummary;
  template?: { id: string; name: string; color: string };
  location?: { id: string; name: string };
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
  status: LeaveStatus;
  employee?: EmployeeSummary;
}

export interface LeaveBalance {
  id: string;
  leaveType: LeaveType;
  year: number;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
  carriedOver: number;
}

export interface Break {
  id: string;
  employeeId: string;
  category: BreakCategory;
  startTime: string;
  endTime?: string;
  duration?: number;
  status: BreakStatus;
  employee?: EmployeeSummary;
}

export interface Document {
  id: string;
  title: string;
  description?: string;
  category: string;
  fileUrl: string;
  fileName: string;
  version: number;
  expiresAt?: string;
  isConfidential: boolean;
  createdAt: string;
  assignedTo?: EmployeeSummary;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: string;
  isPinned: boolean;
  publishedAt: string;
  isRead: boolean;
  createdBy: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  progress: number;
  dueDate?: string;
  isCompanyGoal: boolean;
  isTeamGoal: boolean;
  employee?: EmployeeSummary;
}

export interface DashboardData {
  totalEmployees: number;
  activeLeaves: number;
  pendingApprovals: number;
  todayBreaks: number;
  unreadNotifications: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface LicenseStatus {
  activeUsers: number;
  maxUsers: number;
  activeAdmins: number;
  maxAdmins: number;
  activeSuperAdmins: number;
  maxSuperAdmins: number;
  canAddUser: boolean;
  canAddAdmin: boolean;
  canAddSuperAdmin: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  objectType?: string;
  objectId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  actor?: { id: string; email: string; role: UserRole };
}
