import { Router, Response } from 'express';
import { timeEntriesService } from './time-entries.service';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission, requireAnyPermission } from '../../common/guards/rbac.guard';
import { getClientIp, getUserAgent } from '../../common/utils/audit';
import { TimeEntryType } from '@prisma/client';

const router = Router();

// ============================================================
// Time Entry Routes
// ============================================================

// POST /api/time/clock-in
router.post(
  '/clock-in',
  authGuard,
  requirePermission('time:write'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const { latitude, longitude, notes } = req.body;
      const clientIp = getClientIp(req);

      const result = await timeEntriesService.clockIn(
        {
          employeeId,
          ipAddress: clientIp,
          latitude: latitude ? parseFloat(latitude) : undefined,
          longitude: longitude ? parseFloat(longitude) : undefined,
          notes,
        },
        req.user!.id,
        clientIp,
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json(result.timeEntry);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/time/clock-out
router.post(
  '/clock-out',
  authGuard,
  requirePermission('time:write'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const { latitude, longitude, notes } = req.body;
      const clientIp = getClientIp(req);

      const result = await timeEntriesService.clockOut(
        {
          employeeId,
          ipAddress: clientIp,
          latitude: latitude ? parseFloat(latitude) : undefined,
          longitude: longitude ? parseFloat(longitude) : undefined,
          notes,
        },
        req.user!.id,
        clientIp,
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json(result.timeEntry);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/time/entries – list time entries with filters
router.get(
  '/entries',
  authGuard,
  requireAnyPermission('time:read', 'time:read_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        employeeId,
        dateFrom,
        dateTo,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query as Record<string, string | undefined>;

      // Non-admin users can only see their own entries unless they have read_all
      const userRole = req.user!.role;
      let effectiveEmployeeId = employeeId;
      if (
        !['ADMIN', 'SUPER_ADMIN', 'HR', 'TEAM_LEAD', 'PAYROLL_ADMIN'].includes(userRole) &&
        !employeeId
      ) {
        effectiveEmployeeId = req.user!.employeeId;
      }

      const result = await timeEntriesService.getTimeEntries({
        employeeId: effectiveEmployeeId,
        dateFrom,
        dateTo,
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

// GET /api/time/timesheet/:year/:month – monthly timesheet
router.get(
  '/timesheet/:year/:month',
  authGuard,
  requireAnyPermission('time:read', 'time:read_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const year = parseInt(req.params.year, 10);
      const month = parseInt(req.params.month, 10);

      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        res.status(400).json({ error: 'Invalid year or month' });
        return;
      }

      // Use query param employeeId or fall back to the authenticated user's own
      const userRole = req.user!.role;
      let employeeId = req.query.employeeId as string | undefined;

      if (!employeeId) {
        employeeId = req.user!.employeeId;
      }

      // Non-privileged users can only view their own timesheet
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

      const result = await timeEntriesService.getMonthlyTimesheet(employeeId, year, month);

      if (!result.success) {
        res.status(404).json({ error: result.error });
        return;
      }

      res.json(result.timesheet);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/time/correction – submit manual punch correction
router.post(
  '/correction',
  authGuard,
  requirePermission('time:write'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const { type, timestamp, notes } = req.body;

      if (!type || !timestamp) {
        res.status(400).json({ error: 'type and timestamp are required' });
        return;
      }

      if (![TimeEntryType.CLOCK_IN, TimeEntryType.CLOCK_OUT].includes(type)) {
        res.status(400).json({ error: 'type must be CLOCK_IN or CLOCK_OUT' });
        return;
      }

      const result = await timeEntriesService.submitCorrection(
        { employeeId, type, timestamp, notes },
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json(result.timeEntry);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/time/correction/:id/approve – approve a manual correction
router.put(
  '/correction/:id/approve',
  authGuard,
  requireAnyPermission('time:read_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const result = await timeEntriesService.approveCorrection(
        id,
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        const status = result.error === 'Time entry not found' ? 404 : 400;
        res.status(status).json({ error: result.error });
        return;
      }

      res.json(result.timeEntry);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
