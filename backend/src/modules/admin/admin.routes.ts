import { Router, Response } from 'express';
import { UserRole, AuditAction } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission, requireRole } from '../../common/guards/rbac.guard';
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

export default router;
