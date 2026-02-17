import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from './auth.guard';

// Role hierarchy: higher index = more permissions
const ROLE_HIERARCHY: Record<UserRole, number> = {
  EMPLOYEE: 0,
  TEAM_LEAD: 1,
  HR: 2,
  PAYROLL_ADMIN: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
};

export type Permission =
  | 'employees:read'
  | 'employees:read_all'
  | 'employees:read_team'
  | 'employees:write'
  | 'employees:write_all'
  | 'employees:delete'
  | 'salary:read'
  | 'salary:write'
  | 'shifts:read'
  | 'shifts:read_all'
  | 'shifts:write'
  | 'shifts:write_all'
  | 'time:read'
  | 'time:read_all'
  | 'time:write'
  | 'breaks:read'
  | 'breaks:read_all'
  | 'breaks:write'
  | 'leaves:read'
  | 'leaves:read_all'
  | 'leaves:approve_lead'
  | 'leaves:approve_hr'
  | 'leaves:approve_final'
  | 'documents:read'
  | 'documents:read_all'
  | 'documents:write'
  | 'documents:delete'
  | 'performance:read'
  | 'performance:read_all'
  | 'performance:write'
  | 'goals:read'
  | 'goals:read_all'
  | 'goals:write'
  | 'training:read'
  | 'training:read_all'
  | 'training:write'
  | 'announcements:read'
  | 'announcements:write'
  | 'reports:read'
  | 'reports:read_all'
  | 'reports:export'
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'admin:settings'
  | 'admin:audit_logs'
  | 'admin:backup'
  | 'admin:license';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  EMPLOYEE: [
    'employees:read',
    'shifts:read',
    'time:read',
    'time:write',
    'breaks:read',
    'breaks:write',
    'leaves:read',
    'documents:read',
    'performance:read',
    'goals:read',
    'training:read',
    'announcements:read',
    'reports:read',
  ],
  TEAM_LEAD: [
    'employees:read',
    'employees:read_team',
    'shifts:read',
    'shifts:read_all',
    'shifts:write',
    'time:read',
    'time:read_all',
    'time:write',
    'breaks:read',
    'breaks:read_all',
    'breaks:write',
    'leaves:read',
    'leaves:read_all',
    'leaves:approve_lead',
    'documents:read',
    'documents:write',
    'performance:read',
    'performance:write',
    'goals:read',
    'goals:read_all',
    'goals:write',
    'training:read',
    'training:read_all',
    'announcements:read',
    'reports:read',
    'reports:read_all',
  ],
  HR: [
    'employees:read',
    'employees:read_all',
    'employees:write',
    'employees:write_all',
    'shifts:read',
    'shifts:read_all',
    'shifts:write',
    'shifts:write_all',
    'time:read',
    'time:read_all',
    'time:write',
    'breaks:read',
    'breaks:read_all',
    'breaks:write',
    'leaves:read',
    'leaves:read_all',
    'leaves:approve_lead',
    'leaves:approve_hr',
    'documents:read',
    'documents:read_all',
    'documents:write',
    'documents:delete',
    'performance:read',
    'performance:read_all',
    'performance:write',
    'goals:read',
    'goals:read_all',
    'goals:write',
    'training:read',
    'training:read_all',
    'training:write',
    'announcements:read',
    'announcements:write',
    'reports:read',
    'reports:read_all',
    'reports:export',
  ],
  PAYROLL_ADMIN: [
    'employees:read',
    'employees:read_all',
    'salary:read',
    'salary:write',
    'time:read',
    'time:read_all',
    'breaks:read',
    'breaks:read_all',
    'leaves:read',
    'leaves:read_all',
    'leaves:approve_final',
    'reports:read',
    'reports:read_all',
    'reports:export',
    'announcements:read',
  ],
  ADMIN: [
    'employees:read',
    'employees:read_all',
    'employees:write',
    'employees:write_all',
    'employees:delete',
    'shifts:read',
    'shifts:read_all',
    'shifts:write',
    'shifts:write_all',
    'time:read',
    'time:read_all',
    'time:write',
    'breaks:read',
    'breaks:read_all',
    'breaks:write',
    'leaves:read',
    'leaves:read_all',
    'leaves:approve_lead',
    'leaves:approve_hr',
    'leaves:approve_final',
    'documents:read',
    'documents:read_all',
    'documents:write',
    'documents:delete',
    'performance:read',
    'performance:read_all',
    'performance:write',
    'goals:read',
    'goals:read_all',
    'goals:write',
    'training:read',
    'training:read_all',
    'training:write',
    'announcements:read',
    'announcements:write',
    'reports:read',
    'reports:read_all',
    'reports:export',
    'users:read',
    'users:write',
    'users:delete',
    'admin:settings',
    'admin:audit_logs',
  ],
  SUPER_ADMIN: [
    'employees:read',
    'employees:read_all',
    'employees:write',
    'employees:write_all',
    'employees:delete',
    'salary:read',
    'salary:write',
    'shifts:read',
    'shifts:read_all',
    'shifts:write',
    'shifts:write_all',
    'time:read',
    'time:read_all',
    'time:write',
    'breaks:read',
    'breaks:read_all',
    'breaks:write',
    'leaves:read',
    'leaves:read_all',
    'leaves:approve_lead',
    'leaves:approve_hr',
    'leaves:approve_final',
    'documents:read',
    'documents:read_all',
    'documents:write',
    'documents:delete',
    'performance:read',
    'performance:read_all',
    'performance:write',
    'goals:read',
    'goals:read_all',
    'goals:write',
    'training:read',
    'training:read_all',
    'training:write',
    'announcements:read',
    'announcements:write',
    'reports:read',
    'reports:read_all',
    'reports:export',
    'users:read',
    'users:write',
    'users:delete',
    'admin:settings',
    'admin:audit_logs',
    'admin:backup',
    'admin:license',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasMinRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function requirePermission(...permissions: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
    const hasAll = permissions.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function requireAnyPermission(...permissions: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
    const hasAny = permissions.some((p) => userPermissions.includes(p));

    if (!hasAny) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient role' });
      return;
    }

    next();
  };
}

export { ROLE_PERMISSIONS, ROLE_HIERARCHY };
