import { Router, Response } from 'express';
import { AuditAction, ReviewStatus, UserRole } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission, requireAnyPermission, hasPermission } from '../../common/guards/rbac.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';
import { parsePagination, buildPaginatedResult } from '../../common/utils/pagination';

const router = Router();

// GET /api/performance/reviews
router.get('/reviews', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page, limit, sortBy, sortOrder } = parsePagination(req.query as Record<string, unknown>);
    const { employeeId, status, year } = req.query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (year) where.year = parseInt(String(year), 10);

    if (req.user!.role === UserRole.EMPLOYEE) {
      where.employee = { userId: req.user!.id };
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    const [reviews, total] = await Promise.all([
      prisma.performanceReview.findMany({
        where: where as any,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true } },
          competencyScores: { include: { competency: true } },
        },
        orderBy: { [sortBy || 'createdAt']: sortOrder },
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.performanceReview.count({ where: where as any }),
    ]);

    res.json(buildPaginatedResult(reviews, total, { page, limit, sortBy, sortOrder }));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/performance/reviews
router.post('/reviews', authGuard, requirePermission('performance:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId, period, year, quarter } = req.body;
    if (!employeeId || !period || !year) {
      res.status(400).json({ error: 'Missing required fields' }); return;
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) { res.status(404).json({ error: 'Employee not found' }); return; }

    const reviewer = await prisma.employee.findFirst({ where: { userId: req.user!.id } });
    if (!reviewer) { res.status(400).json({ error: 'Reviewer profile not found' }); return; }

    const review = await prisma.performanceReview.create({
      data: {
        employeeId, reviewerId: reviewer.id, period, year: parseInt(String(year), 10),
        quarter: quarter ? parseInt(String(quarter), 10) : null,
        status: ReviewStatus.DRAFT,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    await createAuditLog({
      actorId: req.user!.id, action: AuditAction.REVIEW_CREATED,
      objectType: 'PerformanceReview', objectId: review.id,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/performance/reviews/:id
router.put('/reviews/:id', authGuard, requirePermission('performance:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { overallScore, strengths, improvements, comments, status, competencyScores } = req.body;

    const review = await prisma.performanceReview.findUnique({ where: { id: req.params.id } });
    if (!review) { res.status(404).json({ error: 'Review not found' }); return; }

    const data: Record<string, unknown> = {};
    if (overallScore !== undefined) data.overallScore = overallScore;
    if (strengths !== undefined) data.strengths = strengths;
    if (improvements !== undefined) data.improvements = improvements;
    if (comments !== undefined) data.comments = comments;
    if (status) data.status = status;
    if (status === ReviewStatus.COMPLETED) data.acknowledgedAt = null;

    const updated = await prisma.performanceReview.update({
      where: { id: req.params.id }, data: data as any,
      include: { competencyScores: { include: { competency: true } } },
    });

    // Upsert competency scores
    if (competencyScores && Array.isArray(competencyScores)) {
      for (const cs of competencyScores) {
        await prisma.competencyScore.upsert({
          where: { reviewId_competencyId: { reviewId: req.params.id, competencyId: cs.competencyId } },
          create: { reviewId: req.params.id, competencyId: cs.competencyId, score: cs.score, comment: cs.comment },
          update: { score: cs.score, comment: cs.comment },
        });
      }
    }

    await createAuditLog({
      actorId: req.user!.id, action: AuditAction.REVIEW_COMPLETED,
      objectType: 'PerformanceReview', objectId: req.params.id,
      after: data as any, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/performance/reviews/:id/acknowledge - employee acknowledges
router.post('/reviews/:id/acknowledge', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const review = await prisma.performanceReview.findUnique({
      where: { id: req.params.id },
      include: { employee: true },
    });
    if (!review) { res.status(404).json({ error: 'Review not found' }); return; }
    if (review.employee.userId !== req.user!.id) {
      res.status(403).json({ error: 'Only the reviewed employee can acknowledge' }); return;
    }

    const { employeeComments } = req.body;
    await prisma.performanceReview.update({
      where: { id: req.params.id },
      data: { acknowledgedAt: new Date(), employeeComments, status: ReviewStatus.ACKNOWLEDGED },
    });

    res.json({ message: 'Review acknowledged' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/performance/competencies
router.get('/competencies', authGuard, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const competencies = await prisma.competency.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    res.json(competencies);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/performance/competencies
router.post('/competencies', authGuard, requirePermission('performance:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, category, maxScore } = req.body;
    if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
    const competency = await prisma.competency.create({
      data: { name, description, category, maxScore: maxScore || 5 },
    });
    res.status(201).json(competency);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/performance/disciplinary/:employeeId
router.get('/disciplinary/:employeeId', authGuard, requireAnyPermission('performance:read_all', 'performance:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const records = await prisma.disciplinaryRecord.findMany({
      where: { employeeId: req.params.employeeId },
      orderBy: { issuedAt: 'desc' },
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/performance/disciplinary
router.post('/disciplinary', authGuard, requirePermission('performance:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId, type, reason, details, expiresAt } = req.body;
    if (!employeeId || !type || !reason) {
      res.status(400).json({ error: 'Missing required fields' }); return;
    }
    const record = await prisma.disciplinaryRecord.create({
      data: { employeeId, type, reason, details, issuedById: req.user!.id, expiresAt: expiresAt ? new Date(expiresAt) : undefined },
    });
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
