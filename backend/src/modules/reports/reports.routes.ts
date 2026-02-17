import { Router, Response } from 'express';
import { EmploymentStatus, LeaveStatus, TrainingStatus, BreakStatus, AuditAction } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission, requireAnyPermission } from '../../common/guards/rbac.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';

const router = Router();

// GET /api/reports/headcount
router.get('/headcount', authGuard, requireAnyPermission('reports:read_all', 'reports:read'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const byDepartment = await prisma.employee.groupBy({
      by: ['departmentId'],
      where: { deletedAt: null, employmentStatus: { not: EmploymentStatus.TERMINATED } },
      _count: true,
    });

    const byLocation = await prisma.employee.groupBy({
      by: ['locationId'],
      where: { deletedAt: null, employmentStatus: { not: EmploymentStatus.TERMINATED } },
      _count: true,
    });

    const byStatus = await prisma.employee.groupBy({
      by: ['employmentStatus'],
      where: { deletedAt: null },
      _count: true,
    });

    const byContractType = await prisma.employee.groupBy({
      by: ['contractType'],
      where: { deletedAt: null, employmentStatus: { not: EmploymentStatus.TERMINATED } },
      _count: true,
    });

    const total = await prisma.employee.count({
      where: { deletedAt: null, employmentStatus: { not: EmploymentStatus.TERMINATED } },
    });

    // Get department and location names
    const departments = await prisma.department.findMany({ select: { id: true, name: true } });
    const locations = await prisma.location.findMany({ select: { id: true, name: true } });

    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const locMap = new Map(locations.map((l) => [l.id, l.name]));

    res.json({
      total,
      byDepartment: byDepartment.map((d) => ({
        departmentId: d.departmentId, name: deptMap.get(d.departmentId || '') || 'Unassigned', count: d._count,
      })),
      byLocation: byLocation.map((l) => ({
        locationId: l.locationId, name: locMap.get(l.locationId || '') || 'Unassigned', count: l._count,
      })),
      byStatus: byStatus.map((s) => ({ status: s.employmentStatus, count: s._count })),
      byContractType: byContractType.map((c) => ({ contractType: c.contractType, count: c._count })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/absence
router.get('/absence', authGuard, requirePermission('reports:read_all'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const startDate = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = to ? new Date(String(to)) : new Date();

    const leaves = await prisma.leaveRequest.findMany({
      where: {
        status: LeaveStatus.APPROVED,
        startDate: { gte: startDate },
        endDate: { lte: endDate },
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, department: { select: { name: true } } },
        },
      },
    });

    const totalDaysOff = leaves.reduce((sum, l) => sum + l.totalDays, 0);
    const byType = leaves.reduce((acc, l) => {
      acc[l.leaveType] = (acc[l.leaveType] || 0) + l.totalDays;
      return acc;
    }, {} as Record<string, number>);

    res.json({ totalLeaves: leaves.length, totalDaysOff, byType, leaves });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/overtime
router.get('/overtime', authGuard, requirePermission('reports:read_all'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const startDate = from ? new Date(String(from)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = to ? new Date(String(to)) : new Date();

    const timeEntries = await prisma.timeEntry.findMany({
      where: { timestamp: { gte: startDate, lte: endDate } },
      include: { employee: { select: { id: true, firstName: true, lastName: true, weeklyHours: true } } },
      orderBy: { timestamp: 'asc' },
    });

    res.json({ period: { from: startDate, to: endDate }, entries: timeEntries.length });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/breaks
router.get('/breaks', authGuard, requirePermission('reports:read_all'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const startDate = from ? new Date(String(from)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(String(to)) : new Date();

    const breaks = await prisma.break.findMany({
      where: { startTime: { gte: startDate, lte: endDate } },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });

    const exceeded = breaks.filter((b) => b.status === BreakStatus.EXCEEDED);
    const totalMinutes = breaks.reduce((sum, b) => sum + (b.duration || 0), 0);

    const byCategory = breaks.reduce((acc, b) => {
      acc[b.category] = (acc[b.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      totalBreaks: breaks.length, exceededBreaks: exceeded.length,
      totalMinutes, averageMinutes: breaks.length ? Math.round(totalMinutes / breaks.length) : 0,
      byCategory,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/punctuality
router.get('/punctuality', authGuard, requirePermission('reports:read_all'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Placeholder - would need shift vs actual clock-in comparison
    res.json({ message: 'Punctuality report available with time entry data' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/training-completion
router.get('/training-completion', authGuard, requirePermission('reports:read_all'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const trainings = await prisma.training.findMany({
      where: { isActive: true, isMandatory: true },
      include: {
        enrollments: { select: { status: true } },
      },
    });

    const totalEmployees = await prisma.employee.count({
      where: { deletedAt: null, employmentStatus: EmploymentStatus.ACTIVE },
    });

    const report = trainings.map((t) => ({
      id: t.id, title: t.title,
      enrolled: t.enrollments.length,
      completed: t.enrollments.filter((e) => e.status === TrainingStatus.COMPLETED).length,
      completionRate: t.enrollments.length > 0
        ? Math.round((t.enrollments.filter((e) => e.status === TrainingStatus.COMPLETED).length / t.enrollments.length) * 100)
        : 0,
      notEnrolled: totalEmployees - t.enrollments.length,
    }));

    res.json({ totalEmployees, trainings: report });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/dashboard
router.get('/dashboard', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalEmployees, activeLeaves, pendingApprovals,
      todayBreaks, unreadNotifications
    ] = await Promise.all([
      prisma.employee.count({ where: { deletedAt: null, employmentStatus: EmploymentStatus.ACTIVE } }),
      prisma.leaveRequest.count({
        where: { status: LeaveStatus.APPROVED, startDate: { lte: now }, endDate: { gte: now } },
      }),
      prisma.approval.count({ where: { status: 'PENDING' } }),
      prisma.break.count({
        where: { startTime: { gte: new Date(now.toISOString().split('T')[0]) } },
      }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
    ]);

    res.json({
      totalEmployees, activeLeaves, pendingApprovals,
      todayBreaks, unreadNotifications,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reports/export
router.post('/export', authGuard, requirePermission('reports:export'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reportType, format, filters } = req.body;
    if (!reportType || !format) {
      res.status(400).json({ error: 'reportType and format are required' }); return;
    }

    await createAuditLog({
      actorId: req.user!.id, action: AuditAction.EXPORT_GENERATED,
      objectType: 'Report', metadata: { reportType, format, filters } as any,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    // In production, this would generate CSV/XLSX/PDF
    res.json({ message: `Export of ${reportType} in ${format} format initiated`, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
