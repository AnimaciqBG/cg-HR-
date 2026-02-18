import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from './auth.guard';
import prisma from '../../config/database';

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
  | 'admin:license'
  | 'admin:permissions';

// All available permissions for the catalog/matrix UI
export const ALL_PERMISSIONS: Permission[] = [
  'employees:read', 'employees:read_all', 'employees:read_team', 'employees:write', 'employees:write_all', 'employees:delete',
  'salary:read', 'salary:write',
  'shifts:read', 'shifts:read_all', 'shifts:write', 'shifts:write_all',
  'time:read', 'time:read_all', 'time:write',
  'breaks:read', 'breaks:read_all', 'breaks:write',
  'leaves:read', 'leaves:read_all', 'leaves:approve_lead', 'leaves:approve_hr', 'leaves:approve_final',
  'documents:read', 'documents:read_all', 'documents:write', 'documents:delete',
  'performance:read', 'performance:read_all', 'performance:write',
  'goals:read', 'goals:read_all', 'goals:write',
  'training:read', 'training:read_all', 'training:write',
  'announcements:read', 'announcements:write',
  'reports:read', 'reports:read_all', 'reports:export',
  'users:read', 'users:write', 'users:delete',
  'admin:settings', 'admin:audit_logs', 'admin:backup', 'admin:license', 'admin:permissions',
];

// Permission categories for grouping in the UI
export const PERMISSION_CATEGORIES: Record<string, Permission[]> = {
  'Employees': ['employees:read', 'employees:read_all', 'employees:read_team', 'employees:write', 'employees:write_all', 'employees:delete'],
  'Salary': ['salary:read', 'salary:write'],
  'Shifts': ['shifts:read', 'shifts:read_all', 'shifts:write', 'shifts:write_all'],
  'Time': ['time:read', 'time:read_all', 'time:write'],
  'Breaks': ['breaks:read', 'breaks:read_all', 'breaks:write'],
  'Leaves': ['leaves:read', 'leaves:read_all', 'leaves:approve_lead', 'leaves:approve_hr', 'leaves:approve_final'],
  'Documents': ['documents:read', 'documents:read_all', 'documents:write', 'documents:delete'],
  'Performance': ['performance:read', 'performance:read_all', 'performance:write'],
  'Goals': ['goals:read', 'goals:read_all', 'goals:write'],
  'Training': ['training:read', 'training:read_all', 'training:write'],
  'Announcements': ['announcements:read', 'announcements:write'],
  'Reports': ['reports:read', 'reports:read_all', 'reports:export'],
  'Users': ['users:read', 'users:write', 'users:delete'],
  'Admin': ['admin:settings', 'admin:audit_logs', 'admin:backup', 'admin:license', 'admin:permissions'],
};

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
    'admin:permissions',
  ],
};

// ============================================================
// PERMISSION RESOLVER: Role defaults + Per-user overrides
// ============================================================

export interface PermissionOverride {
  permission: string;
  granted: boolean;
}

/**
 * Resolve effective permissions for a user:
 * 1. Start with role-based defaults from ROLE_PERMISSIONS
 * 2. Load per-user overrides from DB
 * 3. Apply overrides: granted=true adds permission, granted=false removes it
 */
export async function resolveEffectivePermissions(
  userId: string,
  role: UserRole
): Promise<Permission[]> {
  const rolePermissions = new Set<string>(ROLE_PERMISSIONS[role] || []);

  // Load per-user overrides from DB
  const overrides = await prisma.userPermission.findMany({
    where: { userId },
  });

  for (const override of overrides) {
    if (override.granted) {
      // Grant: add this permission even if role doesn't have it
      rolePermissions.add(override.permission);
    } else {
      // Deny: remove this permission even if role has it
      rolePermissions.delete(override.permission);
    }
  }

  return Array.from(rolePermissions) as Permission[];
}

/**
 * Get per-user overrides only (without role defaults)
 */
export async function getUserOverrides(userId: string): Promise<PermissionOverride[]> {
  const overrides = await prisma.userPermission.findMany({
    where: { userId },
    select: { permission: true, granted: true },
  });
  return overrides;
}

/**
 * Get role-based default permissions (no DB call)
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

// ============================================================
// PERMISSION CHECKS (static, role-based only)
// ============================================================

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasMinRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// ============================================================
// MIDDLEWARE: Checks effective permissions (role + overrides)
// ============================================================

export function requirePermission(...permissions: Permission[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // If effective permissions are already loaded on req.user, use them
    if (req.user.effectivePermissions) {
      const hasAll = permissions.every((p) => req.user!.effectivePermissions!.includes(p));
      if (!hasAll) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      next();
      return;
    }

    // Otherwise resolve from DB
    const effectivePermissions = await resolveEffectivePermissions(req.user.id, req.user.role);
    req.user.effectivePermissions = effectivePermissions;

    const hasAll = permissions.every((p) => effectivePermissions.includes(p));
    if (!hasAll) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function requireAnyPermission(...permissions: Permission[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.user.effectivePermissions) {
      const hasAny = permissions.some((p) => req.user!.effectivePermissions!.includes(p));
      if (!hasAny) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      next();
      return;
    }

    const effectivePermissions = await resolveEffectivePermissions(req.user.id, req.user.role);
    req.user.effectivePermissions = effectivePermissions;

    const hasAny = permissions.some((p) => effectivePermissions.includes(p));
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
