import { Router, Response } from 'express';
import { AuditAction } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requireAnyPermission } from '../../common/guards/rbac.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';
import { calculateScore, calculateAndSaveScore, calculateAllScores } from './score.service';

const router = Router();
router.use(authGuard);

// ---------------------------------------------------------------------------
// GET /api/scores/my
// Get the current user's latest score.
// ---------------------------------------------------------------------------
router.get('/my', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (!employee) {
      res.json({ data: null });
      return;
    }

    const score = await prisma.employeeScore.findFirst({
      where: { employeeId: employee.id, isLatest: true },
    });

    res.json({ data: score });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scores/employee/:employeeId
// Get latest score for a specific employee.
// ---------------------------------------------------------------------------
router.get('/employee/:employeeId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { employeeId } = req.params;

    // RBAC: self or managers
    const self = await prisma.employee.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    const isSelf = self?.id === employeeId;
    const isManager = ['TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isSelf && !isManager) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const score = await prisma.employeeScore.findFirst({
      where: { employeeId, isLatest: true },
    });

    res.json({ data: score });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scores/employee/:employeeId/history
// Get score history for an employee.
// ---------------------------------------------------------------------------
router.get('/employee/:employeeId/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { employeeId } = req.params;

    const self = await prisma.employee.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    const isSelf = self?.id === employeeId;
    const isManager = ['TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isSelf && !isManager) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const scores = await prisma.employeeScore.findMany({
      where: { employeeId },
      orderBy: { calculatedAt: 'desc' },
      take: 20,
    });

    res.json({ data: scores });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scores/employee/:employeeId/live
// Calculate score in real-time without saving (preview).
// ---------------------------------------------------------------------------
router.get('/employee/:employeeId/live', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { employeeId } = req.params;

    const self = await prisma.employee.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    const isSelf = self?.id === employeeId;
    const isManager = ['TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    if (!isSelf && !isManager) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const months = parseInt(String(req.query.months || '6'), 10);
    const score = await calculateScore(employeeId, months);

    res.json({ data: score });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scores/calculate/:employeeId
// Calculate and save score for one employee. Managers only.
// ---------------------------------------------------------------------------
router.post('/calculate/:employeeId', requireAnyPermission('employees:write', 'employees:write_all'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId } = req.params;

    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const months = parseInt(String(req.body.months || '6'), 10);
    const snapshot = await calculateAndSaveScore(employeeId, req.user!.id, months, true);

    await createAuditLog({
      actorId: req.user!.id,
      action: AuditAction.SCORE_RECALCULATED,
      objectType: 'EmployeeScore',
      objectId: snapshot.id,
      after: { employeeId, totalScore: snapshot.totalScore, grade: snapshot.grade } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    res.json({ data: snapshot });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scores/calculate-all
// Calculate scores for all active employees. Admin only.
// ---------------------------------------------------------------------------
router.post('/calculate-all', requireAnyPermission('employees:write_all'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const months = parseInt(String(req.body.months || '6'), 10);
    const count = await calculateAllScores(req.user!.id, months);

    await createAuditLog({
      actorId: req.user!.id,
      action: AuditAction.SCORE_CALCULATED,
      objectType: 'EmployeeScore',
      objectId: 'bulk',
      after: { employeeCount: count, months } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    res.json({ message: `Scores calculated for ${count} employees` });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scores/leaderboard
// Leaderboard: top employees by latest score. Managers only.
// ---------------------------------------------------------------------------
router.get('/leaderboard', requireAnyPermission('employees:read_all', 'employees:read_team'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const departmentId = req.query.departmentId as string | undefined;

    const where: any = { isLatest: true };
    if (departmentId) {
      where.employee = { departmentId };
    }

    const scores = await prisma.employeeScore.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            photoUrl: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { totalScore: 'desc' },
      take: limit,
    });

    res.json({ data: scores });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
