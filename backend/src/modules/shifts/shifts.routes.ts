import { Router, Response } from 'express';
import { shiftsService } from './shifts.service';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission, requireAnyPermission } from '../../common/guards/rbac.guard';
import { getClientIp, getUserAgent } from '../../common/utils/audit';
import { ShiftStatus } from '@prisma/client';

const router = Router();

// ============================================================
// Shift CRUD
// ============================================================

// GET /api/shifts – list shifts with filters
router.get(
  '/',
  authGuard,
  requireAnyPermission('shifts:read', 'shifts:read_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        startDate,
        endDate,
        locationId,
        departmentId,
        employeeId,
        status,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query as Record<string, string | undefined>;

      // Non-admin users can only see their own shifts unless they have read_all
      const userPermissions = req.user!.role;
      let effectiveEmployeeId = employeeId;
      if (
        !['ADMIN', 'SUPER_ADMIN', 'HR', 'TEAM_LEAD'].includes(userPermissions) &&
        !employeeId
      ) {
        effectiveEmployeeId = req.user!.employeeId;
      }

      const result = await shiftsService.listShifts({
        startDate,
        endDate,
        locationId,
        departmentId,
        employeeId: effectiveEmployeeId,
        status: status as ShiftStatus | undefined,
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

// POST /api/shifts – create shift
router.post(
  '/',
  authGuard,
  requireAnyPermission('shifts:write', 'shifts:write_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { employeeId, templateId, locationId, date, startTime, endTime, isOpenShift, notes } =
        req.body;

      const result = await shiftsService.createShift(
        { employeeId, templateId, locationId, date, startTime, endTime, isOpenShift, notes },
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json(result.shift);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/shifts/:id – update shift
router.put(
  '/:id',
  authGuard,
  requireAnyPermission('shifts:write', 'shifts:write_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { employeeId, templateId, locationId, date, startTime, endTime, status, isOpenShift, notes } =
        req.body;

      const result = await shiftsService.updateShift(
        id,
        { employeeId, templateId, locationId, date, startTime, endTime, status, isOpenShift, notes },
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json(result.shift);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/shifts/:id – soft delete shift
router.delete(
  '/:id',
  authGuard,
  requireAnyPermission('shifts:write', 'shifts:write_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const result = await shiftsService.deleteShift(
        id,
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(404).json({ error: result.error });
        return;
      }

      res.json({ message: 'Shift deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ============================================================
// Open shifts
// ============================================================

// GET /api/shifts/open – list open shifts
router.get(
  '/open',
  authGuard,
  requirePermission('shifts:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, locationId, page, limit } = req.query as Record<
        string,
        string | undefined
      >;

      const result = await shiftsService.listOpenShifts({
        startDate,
        endDate,
        locationId,
        page,
        limit,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/shifts/:id/apply – apply to open shift
router.post(
  '/:id/apply',
  authGuard,
  requirePermission('shifts:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const employeeId = req.user!.employeeId;

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const result = await shiftsService.applyToOpenShift(
        id,
        employeeId,
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json(result.shift);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ============================================================
// Swap requests
// ============================================================

// POST /api/shifts/swap – create swap request
router.post(
  '/swap',
  authGuard,
  requirePermission('shifts:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { originalShiftId, targetShiftId, targetEmployeeId, reason } = req.body;
      const employeeId = req.user!.employeeId;

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      if (!originalShiftId) {
        res.status(400).json({ error: 'originalShiftId is required' });
        return;
      }

      const result = await shiftsService.createSwapRequest(
        { originalShiftId, targetShiftId, targetEmployeeId, reason },
        employeeId,
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json(result.swap);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/shifts/swap/:id – approve or reject swap request
router.put(
  '/swap/:id',
  authGuard,
  requireAnyPermission('shifts:write', 'shifts:write_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { decision } = req.body;

      if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
        res.status(400).json({ error: 'decision must be APPROVED or REJECTED' });
        return;
      }

      const result = await shiftsService.resolveSwapRequest(
        id,
        decision as 'APPROVED' | 'REJECTED',
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json(result.swap);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rest violation')) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ============================================================
// Shift templates
// ============================================================

// GET /api/shifts/templates – list templates
router.get(
  '/templates',
  authGuard,
  requireAnyPermission('shifts:read', 'shifts:read_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const templates = await shiftsService.listTemplates(activeOnly);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/shifts/templates – create template
router.post(
  '/templates',
  authGuard,
  requireAnyPermission('shifts:write', 'shifts:write_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, shiftType, startTime, endTime, breakMinutes, color } = req.body;

      const result = await shiftsService.createTemplate({
        name,
        shiftType,
        startTime,
        endTime,
        breakMinutes,
        color,
      });

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json(result.template);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/shifts/templates/:id – update template
router.put(
  '/templates/:id',
  authGuard,
  requireAnyPermission('shifts:write', 'shifts:write_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, shiftType, startTime, endTime, breakMinutes, color, isActive } = req.body;

      const result = await shiftsService.updateTemplate(id, {
        name,
        shiftType,
        startTime,
        endTime,
        breakMinutes,
        color,
        isActive,
      });

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json(result.template);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
