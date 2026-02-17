import { Router, Response } from 'express';
import { breaksService } from './breaks.service';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission, requireAnyPermission } from '../../common/guards/rbac.guard';
import { getClientIp, getUserAgent } from '../../common/utils/audit';
import { BreakCategory } from '@prisma/client';

const router = Router();

// ============================================================
// Break Routes
// ============================================================

// POST /api/breaks/start – start a break
router.post(
  '/start',
  authGuard,
  requirePermission('breaks:write'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const { category, notes } = req.body;

      if (!category) {
        res.status(400).json({ error: 'category is required' });
        return;
      }

      if (!Object.values(BreakCategory).includes(category)) {
        res.status(400).json({
          error: `Invalid category. Must be one of: ${Object.values(BreakCategory).join(', ')}`,
        });
        return;
      }

      const result = await breaksService.startBreak(
        { employeeId, category, notes },
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json(result.break);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/breaks/end – end an active break
router.post(
  '/end',
  authGuard,
  requirePermission('breaks:write'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const { breakId } = req.body;

      if (!breakId) {
        res.status(400).json({ error: 'breakId is required' });
        return;
      }

      const result = await breaksService.endBreak(
        breakId,
        employeeId,
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json({
        break: result.break,
        exceeded: result.exceeded,
        durationMinutes: result.durationMinutes,
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/breaks/active – get current active break
router.get(
  '/active',
  authGuard,
  requirePermission('breaks:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Allow querying another employee's active break if the user has read_all
      const userRole = req.user!.role;
      let employeeId = req.query.employeeId as string | undefined;

      if (!employeeId) {
        employeeId = req.user!.employeeId;
      }

      // Non-privileged users can only view their own active break
      if (
        !['ADMIN', 'SUPER_ADMIN', 'HR', 'TEAM_LEAD', 'PAYROLL_ADMIN'].includes(userRole) &&
        employeeId !== req.user!.employeeId
      ) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const activeBreak = await breaksService.getActiveBreak(employeeId);

      res.json({ data: activeBreak || null });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/breaks – list breaks with filters
router.get(
  '/',
  authGuard,
  requireAnyPermission('breaks:read', 'breaks:read_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        employeeId,
        dateFrom,
        dateTo,
        category,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query as Record<string, string | undefined>;

      // Non-admin users can only see their own breaks unless they have read_all
      const userRole = req.user!.role;
      let effectiveEmployeeId = employeeId;
      if (
        !['ADMIN', 'SUPER_ADMIN', 'HR', 'TEAM_LEAD', 'PAYROLL_ADMIN'].includes(userRole) &&
        !employeeId
      ) {
        effectiveEmployeeId = req.user!.employeeId;
      }

      const result = await breaksService.getBreaks({
        employeeId: effectiveEmployeeId,
        dateFrom,
        dateTo,
        category: category as BreakCategory | undefined,
        page,
        limit,
        sortBy,
        sortOrder,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/breaks/summary – break summary totals by category
router.get(
  '/summary',
  authGuard,
  requireAnyPermission('breaks:read', 'breaks:read_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { employeeId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

      // Non-privileged users can only view their own summary
      const userRole = req.user!.role;
      let effectiveEmployeeId = employeeId;
      if (
        !['ADMIN', 'SUPER_ADMIN', 'HR', 'TEAM_LEAD', 'PAYROLL_ADMIN'].includes(userRole)
      ) {
        effectiveEmployeeId = req.user!.employeeId;
      }

      if (!effectiveEmployeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      if (!dateFrom || !dateTo) {
        res.status(400).json({ error: 'dateFrom and dateTo are required' });
        return;
      }

      const result = await breaksService.getBreakSummary(effectiveEmployeeId, dateFrom, dateTo);

      if (!result.success) {
        res.status(404).json({ error: result.error });
        return;
      }

      res.json(result.summary);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/breaks/limits – check current break limits for the day
router.get(
  '/limits',
  authGuard,
  requirePermission('breaks:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userRole = req.user!.role;
      let employeeId = req.query.employeeId as string | undefined;

      if (!employeeId) {
        employeeId = req.user!.employeeId;
      }

      // Non-privileged users can only check their own limits
      if (
        !['ADMIN', 'SUPER_ADMIN', 'HR', 'TEAM_LEAD', 'PAYROLL_ADMIN'].includes(userRole) &&
        employeeId !== req.user!.employeeId
      ) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const limits = await breaksService.checkBreakLimits(employeeId);

      res.json(limits);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
