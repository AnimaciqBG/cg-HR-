import { Router, Response } from 'express';
import { TrainingStatus, UserRole } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission } from '../../common/guards/rbac.guard';
import { parsePagination, buildPaginatedResult } from '../../common/utils/pagination';

const router = Router();

// GET /api/training
router.get('/', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page, limit, sortBy, sortOrder } = parsePagination(req.query as Record<string, unknown>);
    const { mandatory } = req.query;

    const where: Record<string, unknown> = { isActive: true };
    if (mandatory === 'true') where.isMandatory = true;

    const [trainings, total] = await Promise.all([
      prisma.training.findMany({
        where: where as any,
        orderBy: { [sortBy || 'createdAt']: sortOrder },
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.training.count({ where: where as any }),
    ]);

    res.json(buildPaginatedResult(trainings, total, { page, limit, sortBy, sortOrder }));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/training
router.post('/', authGuard, requirePermission('training:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, content, isMandatory, durationMinutes, passingScore, expiryMonths } = req.body;
    if (!title) { res.status(400).json({ error: 'Title is required' }); return; }

    const training = await prisma.training.create({
      data: { title, description, content, isMandatory: isMandatory || false, durationMinutes, passingScore, expiryMonths },
    });
    res.status(201).json(training);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/training/:id
router.put('/:id', authGuard, requirePermission('training:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, content, isMandatory, durationMinutes, passingScore, expiryMonths, isActive } = req.body;
    const data: Record<string, unknown> = {};
    if (title) data.title = title;
    if (description !== undefined) data.description = description;
    if (content !== undefined) data.content = content;
    if (isMandatory !== undefined) data.isMandatory = isMandatory;
    if (durationMinutes !== undefined) data.durationMinutes = durationMinutes;
    if (passingScore !== undefined) data.passingScore = passingScore;
    if (expiryMonths !== undefined) data.expiryMonths = expiryMonths;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.training.update({ where: { id: req.params.id }, data: data as any });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/training/my-enrollments
router.get('/my-enrollments', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const enrollments = await prisma.employeeTraining.findMany({
      where: { employee: { userId: req.user!.id } },
      include: { training: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/training/:id/enroll - enroll employee(s)
router.post('/:id/enroll', authGuard, requirePermission('training:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeIds, dueDate } = req.body;
    if (!employeeIds || !Array.isArray(employeeIds)) {
      res.status(400).json({ error: 'employeeIds array is required' }); return;
    }

    const training = await prisma.training.findUnique({ where: { id: req.params.id } });
    if (!training) { res.status(404).json({ error: 'Training not found' }); return; }

    const results = [];
    for (const eid of employeeIds) {
      try {
        const enrollment = await prisma.employeeTraining.create({
          data: {
            employeeId: eid, trainingId: req.params.id,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            expiresAt: training.expiryMonths
              ? new Date(Date.now() + training.expiryMonths * 30 * 24 * 60 * 60 * 1000)
              : undefined,
          },
        });
        results.push(enrollment);
      } catch {
        // skip duplicates
      }
    }

    res.status(201).json({ enrolled: results.length });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/training/enrollments/:id - update enrollment status
router.put('/enrollments/:id', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, score } = req.body;
    const data: Record<string, unknown> = {};
    if (status) {
      data.status = status;
      if (status === TrainingStatus.IN_PROGRESS && !data.startedAt) data.startedAt = new Date();
      if (status === TrainingStatus.COMPLETED) data.completedAt = new Date();
    }
    if (score !== undefined) data.score = score;

    const updated = await prisma.employeeTraining.update({
      where: { id: req.params.id }, data: data as any,
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/training/report
router.get('/report', authGuard, requirePermission('training:read_all'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const trainings = await prisma.training.findMany({
      where: { isActive: true },
      include: {
        enrollments: {
          select: { status: true, score: true, completedAt: true },
        },
      },
    });

    const report = trainings.map((t) => ({
      id: t.id, title: t.title, isMandatory: t.isMandatory,
      totalEnrolled: t.enrollments.length,
      completed: t.enrollments.filter((e) => e.status === TrainingStatus.COMPLETED).length,
      inProgress: t.enrollments.filter((e) => e.status === TrainingStatus.IN_PROGRESS).length,
      overdue: t.enrollments.filter((e) => e.status === TrainingStatus.OVERDUE).length,
      averageScore: t.enrollments.filter((e) => e.score !== null).reduce((sum, e) => sum + (e.score || 0), 0) /
        (t.enrollments.filter((e) => e.score !== null).length || 1),
    }));

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
