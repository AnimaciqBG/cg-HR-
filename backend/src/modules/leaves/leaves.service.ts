import prisma from '../../config/database';
import { LeaveType, LeaveStatus, ApprovalStatus, AuditAction, UserRole } from '@prisma/client';
import { createAuditLog } from '../../common/utils/audit';
import { parsePagination, buildPaginatedResult } from '../../common/utils/pagination';
import logger from '../../config/logger';

// ============================================================
// Types
// ============================================================

interface CreateLeaveRequestInput {
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
  attachmentUrl?: string;
}

interface ListLeaveRequestsParams {
  employeeId?: string;
  status?: LeaveStatus;
  leaveType?: LeaveType;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: string;
}

interface AbsenceCalendarParams {
  dateFrom: string;
  dateTo: string;
  departmentId?: string;
  locationId?: string;
}

// ============================================================
// Service
// ============================================================

export class LeavesService {
  // ----------------------------------------------------------
  // Calculate business days between two dates (exclude weekends)
  // ----------------------------------------------------------
  calculateBusinessDays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      // 0 = Sunday, 6 = Saturday
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  // ----------------------------------------------------------
  // Create leave request
  // ----------------------------------------------------------
  async createLeaveRequest(
    input: CreateLeaveRequestInput,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const { employeeId, leaveType, startDate, endDate, reason, attachmentUrl } = input;

    // Validate required fields
    if (!employeeId || !leaveType || !startDate || !endDate) {
      return { success: false, error: 'employeeId, leaveType, startDate, and endDate are required' };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { success: false, error: 'Invalid date format for startDate or endDate' };
    }

    if (end < start) {
      return { success: false, error: 'endDate must be on or after startDate' };
    }

    // Validate employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        manager: { select: { id: true, userId: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // Calculate business days
    const totalDays = this.calculateBusinessDays(start, end);

    if (totalDays <= 0) {
      return { success: false, error: 'Leave request must include at least one business day' };
    }

    // Check leave balance
    const year = start.getFullYear();
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveType_year: {
          employeeId,
          leaveType,
          year,
        },
      },
    });

    if (balance) {
      const available = balance.totalDays + balance.carriedOver - balance.usedDays - balance.pendingDays;
      if (totalDays > available) {
        return {
          success: false,
          error: `Insufficient leave balance. Available: ${available} days, Requested: ${totalDays} days`,
        };
      }
    } else {
      // No balance record found – check if a policy grants days for this leave type
      const policy = await prisma.leavePolicy.findFirst({
        where: {
          leaveType,
          isActive: true,
          OR: [
            { contractType: employee.contractType },
            { contractType: null },
          ],
        },
        orderBy: { contractType: { sort: 'asc', nulls: 'last' } },
      });

      if (policy && policy.requiresApproval) {
        // Leave type exists but no balance record yet – could be first request
        // For types like UNPAID or BEREAVEMENT, allow without strict balance check
      } else if (!policy) {
        return {
          success: false,
          error: `No leave policy found for leave type: ${leaveType}`,
        };
      }
    }

    // Check for overlapping leave requests (not cancelled/rejected)
    const overlapping = await prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        status: {
          notIn: [LeaveStatus.CANCELLED, LeaveStatus.REJECTED],
        },
        OR: [
          {
            startDate: { lte: end },
            endDate: { gte: start },
          },
        ],
      },
    });

    if (overlapping) {
      return {
        success: false,
        error: `Overlapping leave request exists (ID: ${overlapping.id}, ${overlapping.startDate.toISOString().split('T')[0]} to ${overlapping.endDate.toISOString().split('T')[0]})`,
      };
    }

    // Check for shift conflicts
    const conflictingShifts = await prisma.shift.findMany({
      where: {
        employeeId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        date: {
          gte: start,
          lte: end,
        },
      },
      select: { id: true, date: true },
    });

    // Create the leave request with approvals in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const leaveRequest = await tx.leaveRequest.create({
        data: {
          employeeId,
          leaveType,
          startDate: start,
          endDate: end,
          totalDays,
          reason: reason || null,
          status: LeaveStatus.PENDING,
          attachmentUrl: attachmentUrl || null,
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      });

      // Create approval step 1: Team Lead
      await tx.approval.create({
        data: {
          entityType: 'LeaveRequest',
          entityId: leaveRequest.id,
          leaveRequestId: leaveRequest.id,
          step: 1,
          status: ApprovalStatus.PENDING,
          approverRole: UserRole.TEAM_LEAD,
          approverId: employee.manager?.userId || null,
          createdById: actorId,
          slaHours: 48,
        },
      });

      // Create approval step 2: HR
      await tx.approval.create({
        data: {
          entityType: 'LeaveRequest',
          entityId: leaveRequest.id,
          leaveRequestId: leaveRequest.id,
          step: 2,
          status: ApprovalStatus.PENDING,
          approverRole: UserRole.HR,
          createdById: actorId,
          slaHours: 48,
        },
      });

      // Update pending days on leave balance
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: { increment: totalDays },
          },
        });
      }

      return leaveRequest;
    });

    await createAuditLog({
      actorId,
      action: AuditAction.LEAVE_REQUESTED,
      objectType: 'LeaveRequest',
      objectId: result.id,
      after: result as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
      metadata: {
        totalDays,
        conflictingShiftCount: conflictingShifts.length,
        conflictingShiftIds: conflictingShifts.map((s) => s.id),
      },
    });

    return {
      success: true,
      leaveRequest: result,
      warnings: conflictingShifts.length > 0
        ? [`Employee has ${conflictingShifts.length} scheduled shift(s) during the requested leave period`]
        : undefined,
    };
  }

  // ----------------------------------------------------------
  // Get leave requests with filters
  // ----------------------------------------------------------
  async getLeaveRequests(params: ListLeaveRequestsParams) {
    const pagination = parsePagination(params as Record<string, unknown>);
    const skip = (pagination.page - 1) * pagination.limit;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (params.employeeId) {
      where.employeeId = params.employeeId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.leaveType) {
      where.leaveType = params.leaveType;
    }

    if (params.dateFrom || params.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom);
      if (params.dateTo) dateFilter.lte = new Date(params.dateTo);
      where.startDate = dateFilter;
    }

    const allowedSortFields = ['startDate', 'endDate', 'totalDays', 'status', 'leaveType', 'createdAt'];
    const sortBy = allowedSortFields.includes(pagination.sortBy ?? '')
      ? pagination.sortBy!
      : 'createdAt';

    const [leaveRequests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy: { [sortBy]: pagination.sortOrder },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              jobTitle: true,
              department: { select: { id: true, name: true } },
            },
          },
          approvals: {
            select: {
              id: true,
              step: true,
              status: true,
              approverRole: true,
              approverId: true,
              comment: true,
              decidedAt: true,
              approver: {
                select: { id: true, email: true },
              },
            },
            orderBy: { step: 'asc' },
          },
        },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResult(leaveRequests, total, pagination);
  }

  // ----------------------------------------------------------
  // Get single leave request
  // ----------------------------------------------------------
  async getLeaveRequest(id: string, userId: string) {
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            userId: true,
            department: { select: { id: true, name: true } },
            manager: { select: { id: true, userId: true, firstName: true, lastName: true } },
          },
        },
        approvals: {
          select: {
            id: true,
            step: true,
            status: true,
            approverRole: true,
            approverId: true,
            comment: true,
            decidedAt: true,
            createdAt: true,
            approver: {
              select: { id: true, email: true },
            },
          },
          orderBy: { step: 'asc' },
        },
      },
    });

    return leaveRequest;
  }

  // ----------------------------------------------------------
  // Cancel leave request
  // ----------------------------------------------------------
  async cancelLeaveRequest(
    id: string,
    employeeId: string,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
    });

    if (!leaveRequest) {
      return { success: false, error: 'Leave request not found' };
    }

    if (leaveRequest.employeeId !== employeeId) {
      return { success: false, error: 'You can only cancel your own leave requests' };
    }

    if (leaveRequest.status === LeaveStatus.CANCELLED) {
      return { success: false, error: 'Leave request is already cancelled' };
    }

    if (leaveRequest.status === LeaveStatus.REJECTED) {
      return { success: false, error: 'Cannot cancel a rejected leave request' };
    }

    const previousStatus = leaveRequest.status;

    const result = await prisma.$transaction(async (tx) => {
      // Update leave request status
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: { status: LeaveStatus.CANCELLED },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Cancel all pending approvals
      await tx.approval.updateMany({
        where: {
          leaveRequestId: id,
          status: ApprovalStatus.PENDING,
        },
        data: {
          status: ApprovalStatus.REJECTED,
          decidedAt: new Date(),
        },
      });

      // Restore pending days on leave balance
      const year = leaveRequest.startDate.getFullYear();
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveType_year: {
            employeeId: leaveRequest.employeeId,
            leaveType: leaveRequest.leaveType,
            year,
          },
        },
      });

      if (balance) {
        const updates: Record<string, unknown> = {};

        if (
          previousStatus === LeaveStatus.PENDING ||
          previousStatus === LeaveStatus.APPROVED_BY_LEAD ||
          previousStatus === LeaveStatus.APPROVED_BY_HR
        ) {
          // Was still pending – decrement pendingDays
          updates.pendingDays = { decrement: leaveRequest.totalDays };
        } else if (previousStatus === LeaveStatus.APPROVED) {
          // Was fully approved – decrement usedDays
          updates.usedDays = { decrement: leaveRequest.totalDays };
        }

        if (Object.keys(updates).length > 0) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: updates,
          });
        }
      }

      return updated;
    });

    await createAuditLog({
      actorId,
      action: AuditAction.LEAVE_REJECTED,
      objectType: 'LeaveRequest',
      objectId: id,
      before: { status: previousStatus } as unknown as Record<string, unknown>,
      after: { status: LeaveStatus.CANCELLED } as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
      metadata: { action: 'cancelled' },
    });

    return { success: true, leaveRequest: result };
  }

  // ----------------------------------------------------------
  // Approve leave request (multi-step: lead -> HR -> final)
  // ----------------------------------------------------------
  async approveLeaveRequest(
    id: string,
    approverId: string,
    approverRole: UserRole,
    comment?: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        approvals: {
          orderBy: { step: 'asc' },
        },
      },
    });

    if (!leaveRequest) {
      return { success: false, error: 'Leave request not found' };
    }

    if (leaveRequest.status === LeaveStatus.APPROVED) {
      return { success: false, error: 'Leave request is already fully approved' };
    }

    if (leaveRequest.status === LeaveStatus.CANCELLED || leaveRequest.status === LeaveStatus.REJECTED) {
      return { success: false, error: 'Cannot approve a cancelled or rejected leave request' };
    }

    // Find the current pending approval step
    const pendingApproval = leaveRequest.approvals.find(
      (a) => a.status === ApprovalStatus.PENDING
    );

    if (!pendingApproval) {
      return { success: false, error: 'No pending approval step found' };
    }

    // Validate that the approver has the right role for the current step
    if (pendingApproval.step === 1) {
      // Step 1: Team Lead approval
      if (
        approverRole !== UserRole.TEAM_LEAD &&
        approverRole !== UserRole.HR &&
        approverRole !== UserRole.ADMIN &&
        approverRole !== UserRole.SUPER_ADMIN
      ) {
        return { success: false, error: 'Only team leads or higher roles can approve step 1' };
      }
    } else if (pendingApproval.step === 2) {
      // Step 2: HR approval
      if (
        approverRole !== UserRole.HR &&
        approverRole !== UserRole.ADMIN &&
        approverRole !== UserRole.SUPER_ADMIN
      ) {
        return { success: false, error: 'Only HR or higher roles can approve step 2' };
      }
    }

    // Determine the new leave status after this approval
    let newLeaveStatus: LeaveStatus;
    const isLastStep = pendingApproval.step >= leaveRequest.approvals.length;

    if (pendingApproval.step === 1 && !isLastStep) {
      newLeaveStatus = LeaveStatus.APPROVED_BY_LEAD;
    } else if (pendingApproval.step === 2 || isLastStep) {
      newLeaveStatus = LeaveStatus.APPROVED;
    } else {
      newLeaveStatus = LeaveStatus.APPROVED_BY_HR;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update the approval step
      await tx.approval.update({
        where: { id: pendingApproval.id },
        data: {
          status: ApprovalStatus.APPROVED,
          approverId,
          comment: comment || null,
          decidedAt: new Date(),
        },
      });

      // Update the leave request status
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: { status: newLeaveStatus },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
            },
          },
          approvals: {
            orderBy: { step: 'asc' },
            select: {
              id: true,
              step: true,
              status: true,
              approverRole: true,
              approverId: true,
              comment: true,
              decidedAt: true,
            },
          },
        },
      });

      // If fully approved, move days from pending to used
      if (newLeaveStatus === LeaveStatus.APPROVED) {
        const year = leaveRequest.startDate.getFullYear();
        const balance = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveType_year: {
              employeeId: leaveRequest.employeeId,
              leaveType: leaveRequest.leaveType,
              year,
            },
          },
        });

        if (balance) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pendingDays: { decrement: leaveRequest.totalDays },
              usedDays: { increment: leaveRequest.totalDays },
            },
          });
        }
      }

      return updated;
    });

    await createAuditLog({
      actorId: approverId,
      action: AuditAction.LEAVE_APPROVED,
      objectType: 'LeaveRequest',
      objectId: id,
      after: {
        status: newLeaveStatus,
        approvalStep: pendingApproval.step,
      } as unknown as Record<string, unknown>,
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
      metadata: { comment, step: pendingApproval.step },
    });

    return { success: true, leaveRequest: result };
  }

  // ----------------------------------------------------------
  // Reject leave request
  // ----------------------------------------------------------
  async rejectLeaveRequest(
    id: string,
    approverId: string,
    approverRole: UserRole,
    comment?: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        approvals: {
          orderBy: { step: 'asc' },
        },
      },
    });

    if (!leaveRequest) {
      return { success: false, error: 'Leave request not found' };
    }

    if (leaveRequest.status === LeaveStatus.CANCELLED || leaveRequest.status === LeaveStatus.REJECTED) {
      return { success: false, error: 'Leave request is already cancelled or rejected' };
    }

    if (leaveRequest.status === LeaveStatus.APPROVED) {
      return { success: false, error: 'Cannot reject an already approved leave request. Cancel it instead.' };
    }

    // Find the current pending approval step
    const pendingApproval = leaveRequest.approvals.find(
      (a) => a.status === ApprovalStatus.PENDING
    );

    if (!pendingApproval) {
      return { success: false, error: 'No pending approval step found' };
    }

    // Validate approver role for current step
    if (pendingApproval.step === 1) {
      if (
        approverRole !== UserRole.TEAM_LEAD &&
        approverRole !== UserRole.HR &&
        approverRole !== UserRole.ADMIN &&
        approverRole !== UserRole.SUPER_ADMIN
      ) {
        return { success: false, error: 'Only team leads or higher roles can reject at step 1' };
      }
    } else if (pendingApproval.step === 2) {
      if (
        approverRole !== UserRole.HR &&
        approverRole !== UserRole.ADMIN &&
        approverRole !== UserRole.SUPER_ADMIN
      ) {
        return { success: false, error: 'Only HR or higher roles can reject at step 2' };
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Reject the current approval step
      await tx.approval.update({
        where: { id: pendingApproval.id },
        data: {
          status: ApprovalStatus.REJECTED,
          approverId,
          comment: comment || null,
          decidedAt: new Date(),
        },
      });

      // Reject all remaining pending approval steps
      await tx.approval.updateMany({
        where: {
          leaveRequestId: id,
          status: ApprovalStatus.PENDING,
        },
        data: {
          status: ApprovalStatus.REJECTED,
          decidedAt: new Date(),
        },
      });

      // Update the leave request status to rejected
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: { status: LeaveStatus.REJECTED },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
            },
          },
          approvals: {
            orderBy: { step: 'asc' },
            select: {
              id: true,
              step: true,
              status: true,
              approverRole: true,
              approverId: true,
              comment: true,
              decidedAt: true,
            },
          },
        },
      });

      // Restore pending days on leave balance
      const year = leaveRequest.startDate.getFullYear();
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveType_year: {
            employeeId: leaveRequest.employeeId,
            leaveType: leaveRequest.leaveType,
            year,
          },
        },
      });

      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: { decrement: leaveRequest.totalDays },
          },
        });
      }

      return updated;
    });

    await createAuditLog({
      actorId: approverId,
      action: AuditAction.LEAVE_REJECTED,
      objectType: 'LeaveRequest',
      objectId: id,
      after: {
        status: LeaveStatus.REJECTED,
        approvalStep: pendingApproval.step,
      } as unknown as Record<string, unknown>,
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
      metadata: { comment, step: pendingApproval.step },
    });

    return { success: true, leaveRequest: result };
  }

  // ----------------------------------------------------------
  // Get leave balances for an employee
  // ----------------------------------------------------------
  async getLeaveBalances(employeeId: string, year?: number) {
    const targetYear = year || new Date().getFullYear();

    // Validate employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    const balances = await prisma.leaveBalance.findMany({
      where: {
        employeeId,
        year: targetYear,
      },
      orderBy: { leaveType: 'asc' },
    });

    // Enrich with computed available days
    const enriched = balances.map((b) => ({
      ...b,
      availableDays: b.totalDays + b.carriedOver - b.usedDays - b.pendingDays,
    }));

    return {
      success: true,
      employee,
      year: targetYear,
      balances: enriched,
    };
  }

  // ----------------------------------------------------------
  // Get absence calendar
  // ----------------------------------------------------------
  async getAbsenceCalendar(params: AbsenceCalendarParams) {
    const { dateFrom, dateTo, departmentId, locationId } = params;

    if (!dateFrom || !dateTo) {
      return { success: false, error: 'dateFrom and dateTo are required' };
    }

    const start = new Date(dateFrom);
    const end = new Date(dateTo);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { success: false, error: 'Invalid date format' };
    }

    const employeeFilter: Record<string, unknown> = {};
    if (departmentId) {
      employeeFilter.departmentId = departmentId;
    }
    if (locationId) {
      employeeFilter.locationId = locationId;
    }

    const where: Record<string, unknown> = {
      deletedAt: null,
      status: {
        in: [
          LeaveStatus.APPROVED,
          LeaveStatus.APPROVED_BY_LEAD,
          LeaveStatus.APPROVED_BY_HR,
        ],
      },
      startDate: { lte: end },
      endDate: { gte: start },
    };

    if (Object.keys(employeeFilter).length > 0) {
      where.employee = employeeFilter;
    }

    const leaveRequests = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    // Group by date for calendar view
    const calendarEntries: Record<string, Array<{
      employeeId: string;
      employeeName: string;
      department: string | null;
      leaveType: LeaveType;
      status: LeaveStatus;
      leaveRequestId: string;
    }>> = {};

    for (const lr of leaveRequests) {
      const current = new Date(Math.max(lr.startDate.getTime(), start.getTime()));
      const lastDay = new Date(Math.min(lr.endDate.getTime(), end.getTime()));

      while (current <= lastDay) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const dateKey = current.toISOString().split('T')[0];
          if (!calendarEntries[dateKey]) {
            calendarEntries[dateKey] = [];
          }
          calendarEntries[dateKey].push({
            employeeId: lr.employee.id,
            employeeName: `${lr.employee.firstName} ${lr.employee.lastName}`,
            department: lr.employee.department?.name || null,
            leaveType: lr.leaveType,
            status: lr.status,
            leaveRequestId: lr.id,
          });
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return {
      success: true,
      dateFrom: dateFrom,
      dateTo: dateTo,
      totalAbsences: leaveRequests.length,
      calendar: calendarEntries,
    };
  }

  // ----------------------------------------------------------
  // Get leave policies
  // ----------------------------------------------------------
  async getLeavePolicies() {
    const policies = await prisma.leavePolicy.findMany({
      where: { isActive: true },
      orderBy: [{ leaveType: 'asc' }, { contractType: 'asc' }],
    });

    return policies;
  }
}

export const leavesService = new LeavesService();
