import { Router, Response } from 'express';
import { UserRole, AuditAction } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission, requireRole } from '../../common/guards/rbac.guard';
import {
  ALL_PERMISSIONS, PERMISSION_CATEGORIES, ROLE_PERMISSIONS,
  resolveEffectivePermissions, getUserOverrides, getRolePermissions,
  type Permission,
} from '../../common/guards/rbac.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';
import { getLicenseStatus } from '../../common/utils/license';
import { parsePagination, buildPaginatedResult } from '../../common/utils/pagination';

const router = Router();

// ============ DEPARTMENTS ============

// GET /api/admin/departments
router.get('/departments', authGuard, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const departments = await prisma.department.findMany({
      where: { deletedAt: null },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(departments);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/departments
router.post('/departments', authGuard, requirePermission('admin:settings'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, code, description, parentId } = req.body;
    if (!name || !code) { res.status(400).json({ error: 'Name and code are required' }); return; }

    const dept = await prisma.department.create({
      data: { name, code, description, parentId: parentId || undefined },
    });
    res.status(201).json(dept);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/departments/:id
router.put('/departments/:id', authGuard, requirePermission('admin:settings'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, code, description, headId, parentId } = req.body;
    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (code) data.code = code;
    if (description !== undefined) data.description = description;
    if (headId !== undefined) data.headId = headId;
    if (parentId !== undefined) data.parentId = parentId;

    const updated = await prisma.department.update({ where: { id: req.params.id }, data: data as any });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ LOCATIONS ============

// GET /api/admin/locations
router.get('/locations', authGuard, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const locations = await prisma.location.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/locations
router.post('/locations', authGuard, requirePermission('admin:settings'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, code, address, city, country, timezone, latitude, longitude, geoRadius } = req.body;
    if (!name || !code) { res.status(400).json({ error: 'Name and code are required' }); return; }

    const location = await prisma.location.create({
      data: { name, code, address, city, country, timezone, latitude, longitude, geoRadius },
    });
    res.status(201).json(location);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/locations/:id
router.put('/locations/:id', authGuard, requirePermission('admin:settings'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, code, address, city, latitude, longitude, geoRadius, isActive } = req.body;
    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (code) data.code = code;
    if (address !== undefined) data.address = address;
    if (city !== undefined) data.city = city;
    if (latitude !== undefined) data.latitude = latitude;
    if (longitude !== undefined) data.longitude = longitude;
    if (geoRadius !== undefined) data.geoRadius = geoRadius;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.location.update({ where: { id: req.params.id }, data: data as any });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ SYSTEM SETTINGS ============

// GET /api/admin/settings
router.get('/settings', authGuard, requirePermission('admin:settings'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = await prisma.systemSetting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
    const grouped = settings.reduce((acc, s) => {
      if (!acc[s.group]) acc[s.group] = [];
      acc[s.group].push(s);
      return acc;
    }, {} as Record<string, typeof settings>);
    res.json(grouped);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/settings
router.put('/settings', authGuard, requirePermission('admin:settings'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { settings } = req.body;
    if (!settings || !Array.isArray(settings)) {
      res.status(400).json({ error: 'Settings array is required' }); return;
    }

    for (const s of settings) {
      await prisma.systemSetting.upsert({
        where: { key: s.key },
        create: { key: s.key, value: String(s.value), type: s.type || 'string', group: s.group || 'general', description: s.description, updatedBy: req.user!.id },
        update: { value: String(s.value), updatedBy: req.user!.id },
      });
    }

    await createAuditLog({
      actorId: req.user!.id, action: AuditAction.SETTINGS_CHANGED,
      objectType: 'SystemSetting', after: { settings } as any,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    res.json({ message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ LICENSE & LIMITS ============

// GET /api/admin/license
router.get('/license', authGuard, requirePermission('admin:settings'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await getLicenseStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/license - only Super Admin
router.put('/license', authGuard, requireRole(UserRole.SUPER_ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { maxUsers, maxAdmins, maxSuperAdmins } = req.body;

    const updates: { key: string; value: string }[] = [];
    if (maxUsers !== undefined) updates.push({ key: 'maxUsers', value: String(maxUsers) });
    if (maxAdmins !== undefined) updates.push({ key: 'maxAdmins', value: String(maxAdmins) });
    if (maxSuperAdmins !== undefined) updates.push({ key: 'maxSuperAdmins', value: String(maxSuperAdmins) });

    for (const u of updates) {
      await prisma.systemSetting.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value, type: 'number', group: 'license', updatedBy: req.user!.id },
        update: { value: u.value, updatedBy: req.user!.id },
      });
    }

    await createAuditLog({
      actorId: req.user!.id, action: AuditAction.SETTINGS_CHANGED,
      objectType: 'License', after: { maxUsers, maxAdmins, maxSuperAdmins } as any,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    const newStatus = await getLicenseStatus();
    res.json(newStatus);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ AUDIT LOGS ============

// GET /api/admin/audit-logs
router.get('/audit-logs', authGuard, requirePermission('admin:audit_logs'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page, limit, sortOrder } = parsePagination(req.query as Record<string, unknown>);
    const { action, actorId, objectType, from, to } = req.query;

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (actorId) where.actorId = actorId;
    if (objectType) where.objectType = objectType;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(String(from));
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(String(to));
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: where as any,
        include: { actor: { select: { id: true, email: true, role: true } } },
        orderBy: { createdAt: sortOrder || 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.auditLog.count({ where: where as any }),
    ]);

    res.json(buildPaginatedResult(logs, total, { page, limit, sortBy: 'createdAt', sortOrder }));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ POLICIES ============

// GET /api/admin/policies/leave
router.get('/policies/leave', authGuard, requirePermission('admin:settings'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const policies = await prisma.leavePolicy.findMany({ orderBy: { name: 'asc' } });
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/policies/leave
router.post('/policies/leave', authGuard, requirePermission('admin:settings'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, leaveType, contractType, daysPerYear, maxCarryOver, minServiceMonths, requiresApproval } = req.body;
    if (!name || !leaveType) { res.status(400).json({ error: 'Name and leaveType are required' }); return; }

    const policy = await prisma.leavePolicy.create({
      data: { name, leaveType, contractType, daysPerYear: daysPerYear || 20, maxCarryOver: maxCarryOver || 0, minServiceMonths: minServiceMonths || 0, requiresApproval: requiresApproval !== false },
    });
    res.status(201).json(policy);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/policies/break
router.get('/policies/break', authGuard, requirePermission('admin:settings'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const policies = await prisma.breakPolicy.findMany({ orderBy: { name: 'asc' } });
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/policies/break
router.post('/policies/break', authGuard, requirePermission('admin:settings'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, maxBreaksPerDay, maxMinutesPerBreak, maxTotalMinutes, alertOnExceed } = req.body;
    if (!name) { res.status(400).json({ error: 'Name is required' }); return; }

    const policy = await prisma.breakPolicy.create({
      data: { name, maxBreaksPerDay, maxMinutesPerBreak, maxTotalMinutes, alertOnExceed },
    });
    res.status(201).json(policy);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/policies/overtime
router.get('/policies/overtime', authGuard, requirePermission('admin:settings'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const policies = await prisma.overtimePolicy.findMany({ orderBy: { name: 'asc' } });
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/backup
router.post('/backup', authGuard, requirePermission('admin:backup'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await createAuditLog({
      actorId: req.user!.id, action: AuditAction.BACKUP_CREATED,
      objectType: 'System', ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });
    res.json({ message: 'Backup initiated', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ PERMISSIONS ENGINE ============

// GET /api/admin/permissions/catalog - list all permission keys + categories
router.get('/permissions/catalog', authGuard, requirePermission('admin:permissions'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      permissions: ALL_PERMISSIONS,
      categories: PERMISSION_CATEGORIES,
      roles: Object.keys(ROLE_PERMISSIONS),
      roleDefaults: Object.fromEntries(
        Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, perms])
      ),
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/permissions/user/:userId - get effective permissions + overrides for a user
router.get('/permissions/user/:userId', authGuard, requirePermission('admin:permissions'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, employee: { select: { firstName: true, lastName: true, jobTitle: true } } },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const rolePermissions = getRolePermissions(user.role);
    const overrides = await getUserOverrides(userId);
    const effectivePermissions = await resolveEffectivePermissions(userId, user.role);

    res.json({
      user: { id: user.id, email: user.email, role: user.role, employee: user.employee },
      rolePermissions,
      overrides,
      effectivePermissions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/permissions/user/:userId - set permission overrides for a user
router.put('/permissions/user/:userId', authGuard, requirePermission('admin:permissions'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { overrides } = req.body as { overrides: { permission: string; granted: boolean }[] };

    if (!overrides || !Array.isArray(overrides)) {
      res.status(400).json({ error: 'overrides array is required' });
      return;
    }

    // Validate all permissions
    for (const o of overrides) {
      if (!ALL_PERMISSIONS.includes(o.permission as Permission)) {
        res.status(400).json({ error: `Invalid permission: ${o.permission}` });
        return;
      }
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cannot modify SUPER_ADMIN permissions unless you are SUPER_ADMIN
    if (targetUser.role === UserRole.SUPER_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: 'Cannot modify Main Manager permissions' });
      return;
    }

    // Get existing overrides for audit logging (before state)
    const existingOverrides = await prisma.userPermission.findMany({ where: { userId } });

    // Delete all existing overrides for this user and recreate
    await prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });

      if (overrides.length > 0) {
        await tx.userPermission.createMany({
          data: overrides.map((o) => ({
            userId,
            permission: o.permission,
            granted: o.granted,
            grantedBy: req.user!.id,
          })),
        });
      }
    });

    // Audit log
    await createAuditLog({
      actorId: req.user!.id,
      action: AuditAction.PERMISSION_CHANGED,
      objectType: 'UserPermission',
      objectId: userId,
      before: { overrides: existingOverrides.map(o => ({ permission: o.permission, granted: o.granted })) } as any,
      after: { overrides } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    // Return updated effective permissions
    const effectivePermissions = await resolveEffectivePermissions(userId, targetUser.role);
    res.json({ message: 'Permissions updated', effectivePermissions });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/permissions/user/:userId/:permission - remove a single override
router.delete('/permissions/user/:userId/:permission', authGuard, requirePermission('admin:permissions'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, permission } = req.params;

    const existing = await prisma.userPermission.findUnique({
      where: { userId_permission: { userId, permission } },
    });

    if (!existing) {
      res.status(404).json({ error: 'Override not found' });
      return;
    }

    await prisma.userPermission.delete({
      where: { userId_permission: { userId, permission } },
    });

    await createAuditLog({
      actorId: req.user!.id,
      action: AuditAction.PERMISSION_CHANGED,
      objectType: 'UserPermission',
      objectId: userId,
      before: { permission, granted: existing.granted } as any,
      after: { permission, action: 'removed' } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    res.json({ message: 'Override removed' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/permissions/matrix - get all users with their permissions for the matrix view
router.get('/permissions/matrix', authGuard, requirePermission('admin:permissions'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null, status: { not: 'INACTIVE' } },
      select: {
        id: true, email: true, role: true,
        employee: { select: { firstName: true, lastName: true, jobTitle: true } },
        permissionOverrides: { select: { permission: true, granted: true } },
      },
      orderBy: { role: 'desc' },
    });

    const matrix = users.map((u) => {
      const rolePerms = getRolePermissions(u.role);
      const overrideMap: Record<string, boolean> = {};
      for (const o of u.permissionOverrides) {
        overrideMap[o.permission] = o.granted;
      }

      // Calculate effective
      const effective = new Set<string>(rolePerms);
      for (const o of u.permissionOverrides) {
        if (o.granted) effective.add(o.permission);
        else effective.delete(o.permission);
      }

      return {
        user: { id: u.id, email: u.email, role: u.role, employee: u.employee },
        rolePermissions: rolePerms,
        overrides: overrideMap,
        effectivePermissions: Array.from(effective),
      };
    });

    res.json({
      matrix,
      allPermissions: ALL_PERMISSIONS,
      categories: PERMISSION_CATEGORIES,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
