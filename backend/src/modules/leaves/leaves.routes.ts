import { Router, Response } from 'express';
import { leavesService } from './leaves.service';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission, requireAnyPermission, hasPermission } from '../../common/guards/rbac.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';
import { LeaveType, LeaveStatus, ApprovalStatus, AuditAction, UserRole } from '@prisma/client';

const router = Router();

// ============================================================
// Leave Requests
// ============================================================

// POST /api/leaves – create a leave request
router.post(
  '/',
  authGuard,
  requirePermission('leaves:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const employeeId = req.user!.employeeId;

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const { leaveType, startDate, endDate, reason, attachmentUrl } = req.body;

      if (!leaveType || !startDate || !endDate) {
        res.status(400).json({ error: 'leaveType, startDate, and endDate are required' });
        return;
      }

      // Validate leaveType is a valid enum value
      const validLeaveTypes = Object.values(LeaveType);
      if (!validLeaveTypes.includes(leaveType)) {
        res.status(400).json({
          error: `Invalid leaveType. Must be one of: ${validLeaveTypes.join(', ')}`,
        });
        return;
      }

      const result = await leavesService.createLeaveRequest(
        { employeeId, leaveType, startDate, endDate, reason, attachmentUrl },
        req.user!.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      const response: Record<string, unknown> = { leaveRequest: result.leaveRequest };
      if (result.warnings && result.warnings.length > 0) {
        response.warnings = result.warnings;
      }

      res.status(201).json(response);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/leaves – list leave requests with filters
router.get(
  '/',
  authGuard,
  requirePermission('leaves:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        employeeId,
        status,
        leaveType,
        dateFrom,
        dateTo,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query as Record<string, string | undefined>;

      // Non-privileged users can only see their own leave requests
      let effectiveEmployeeId = employeeId;
      if (!hasPermission(req.user!.role, 'leaves:read_all') && !employeeId) {
        effectiveEmployeeId = req.user!.employeeId;
      }

      // If a specific employeeId is requested and user does not have read_all, restrict to own
      if (
        employeeId &&
        employeeId !== req.user!.employeeId &&
        !hasPermission(req.user!.role, 'leaves:read_all')
      ) {
        res.status(403).json({ error: 'You can only view your own leave requests' });
        return;
      }

      const result = await leavesService.getLeaveRequests({
        employeeId: effectiveEmployeeId,
        status: status as LeaveStatus | undefined,
        leaveType: leaveType as LeaveType | undefined,
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

// GET /api/leaves/balances – get leave balances (own or by employeeId for managers)
router.get(
  '/balances',
  authGuard,
  requirePermission('leaves:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { employeeId, year } = req.query as Record<string, string | undefined>;

      let targetEmployeeId = employeeId || req.user!.employeeId;

      if (!targetEmployeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      // If requesting another employee's balances, check permission
      if (
        targetEmployeeId !== req.user!.employeeId &&
        !hasPermission(req.user!.role, 'leaves:read_all')
      ) {
        res.status(403).json({ error: 'You can only view your own leave balances' });
        return;
      }

      const targetYear = year ? parseInt(year, 10) : undefined;
      const result = await leavesService.getLeaveBalances(targetEmployeeId, targetYear);

      if (!result.success) {
        res.status(404).json({ error: result.error });
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/leaves/calendar – absence calendar
router.get(
  '/calendar',
  authGuard,
  requireAnyPermission('leaves:read', 'leaves:read_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { dateFrom, dateTo, departmentId, locationId } = req.query as Record<
        string,
        string | undefined
      >;

      if (!dateFrom || !dateTo) {
        res.status(400).json({ error: 'dateFrom and dateTo query parameters are required' });
        return;
      }

      const result = await leavesService.getAbsenceCalendar({
        dateFrom,
        dateTo,
        departmentId,
        locationId,
      });

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/leaves/policies – get active leave policies
router.get(
  '/policies',
  authGuard,
  requirePermission('leaves:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const policies = await leavesService.getLeavePolicies();
      res.json(policies);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/leaves/:id – get single leave request
router.get(
  '/:id',
  authGuard,
  requirePermission('leaves:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const leaveRequest = await leavesService.getLeaveRequest(id, req.user!.id);

      if (!leaveRequest) {
        res.status(404).json({ error: 'Leave request not found' });
        return;
      }

      // Non-privileged users can only see their own leave requests
      if (
        leaveRequest.employee.userId !== req.user!.id &&
        !hasPermission(req.user!.role, 'leaves:read_all')
      ) {
        // Allow the manager to view their subordinate's requests
        const isManager = leaveRequest.employee.manager?.userId === req.user!.id;
        if (!isManager) {
          res.status(403).json({ error: 'You do not have permission to view this leave request' });
          return;
        }
      }

      res.json(leaveRequest);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/leaves/:id/cancel – cancel a leave request
router.post(
  '/:id/cancel',
  authGuard,
  requirePermission('leaves:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const employeeId = req.user!.employeeId;

      if (!employeeId) {
        res.status(400).json({ error: 'No employee profile linked to this user' });
        return;
      }

      const result = await leavesService.cancelLeaveRequest(
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

      res.json(result.leaveRequest);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/leaves/:id/approve – approve a leave request
router.post(
  '/:id/approve',
  authGuard,
  requireAnyPermission('leaves:approve_lead', 'leaves:approve_hr', 'leaves:approve_final'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { comment } = req.body;

      const result = await leavesService.approveLeaveRequest(
        id,
        req.user!.id,
        req.user!.role,
        comment,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json(result.leaveRequest);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/leaves/:id/reject – reject a leave request
router.post(
  '/:id/reject',
  authGuard,
  requireAnyPermission('leaves:approve_lead', 'leaves:approve_hr', 'leaves:approve_final'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { comment } = req.body;

      const result = await leavesService.rejectLeaveRequest(
        id,
        req.user!.id,
        req.user!.role,
        comment,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json(result.leaveRequest);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
