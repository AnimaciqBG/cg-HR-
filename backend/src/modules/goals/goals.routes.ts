import { Router, Response } from 'express';
import { AuditAction, GoalStatus, UserRole } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission } from '../../common/guards/rbac.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';
import { parsePagination, buildPaginatedResult } from '../../common/utils/pagination';

const router = Router();

// GET /api/goals
router.get('/', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page, limit, sortBy, sortOrder } = parsePagination(req.query as Record<string, unknown>);
    const { employeeId, status, isCompanyGoal, isTeamGoal } = req.query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (isCompanyGoal === 'true') where.isCompanyGoal = true;
    if (isTeamGoal === 'true') where.isTeamGoal = true;

    if (req.user!.role === UserRole.EMPLOYEE) {
      where.OR = [{ employee: { userId: req.user!.id } }, { isCompanyGoal: true }];
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    const [goals, total] = await Promise.all([
      prisma.goal.findMany({
        where: where as any,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          subGoals: { select: { id: true, title: true, status: true, progress: true } },
          checkIns: { take: 5, orderBy: { createdAt: 'desc' } },
        },
        orderBy: { [sortBy || 'createdAt']: sortOrder },
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.goal.count({ where: where as any }),
    ]);

    res.json(buildPaginatedResult(goals, total, { page, limit, sortBy, sortOrder }));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goals
router.post('/', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, employeeId, startDate, dueDate, parentGoalId, isCompanyGoal, isTeamGoal } = req.body;
    if (!title) { res.status(400).json({ error: 'Title is required' }); return; }

    const goal = await prisma.goal.create({
      data: {
        title, description,
        employeeId: employeeId || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        parentGoalId: parentGoalId || undefined,
        isCompanyGoal: isCompanyGoal || false,
        isTeamGoal: isTeamGoal || false,
        createdBy: req.user!.id,
      },
    });

    await createAuditLog({
      actorId: req.user!.id, action: AuditAction.GOAL_CREATED,
      objectType: 'Goal', objectId: goal.id,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    res.status(201).json(goal);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/goals/:id
router.put('/:id', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const goal = await prisma.goal.findUnique({ where: { id: req.params.id } });
    if (!goal) { res.status(404).json({ error: 'Goal not found' }); return; }

    const { title, description, status, progress, dueDate } = req.body;
    const data: Record<string, unknown> = {};
    if (title) data.title = title;
    if (description !== undefined) data.description = description;
    if (status) data.status = status;
    if (progress !== undefined) data.progress = progress;
    if (dueDate) data.dueDate = new Date(dueDate);
    if (status === GoalStatus.COMPLETED) data.completedAt = new Date();

    const updated = await prisma.goal.update({ where: { id: req.params.id }, data: data as any });

    await createAuditLog({
      actorId: req.user!.id, action: AuditAction.GOAL_UPDATED,
      objectType: 'Goal', objectId: req.params.id,
      after: data as any, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goals/:id/check-in
router.post('/:id/check-in', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { progress, comment } = req.body;
    if (progress === undefined) { res.status(400).json({ error: 'Progress is required' }); return; }

    const checkIn = await prisma.goalCheckIn.create({
      data: { goalId: req.params.id, progress, comment, createdBy: req.user!.id },
    });

    await prisma.goal.update({
      where: { id: req.params.id },
      data: { progress, status: progress >= 100 ? GoalStatus.COMPLETED : undefined },
    });

    res.status(201).json(checkIn);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
