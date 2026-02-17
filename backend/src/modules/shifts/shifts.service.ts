import prisma from '../../config/database';
import { AuditAction, ShiftStatus, ApprovalStatus } from '@prisma/client';
import { createAuditLog } from '../../common/utils/audit';
import { parsePagination, buildPaginatedResult, PaginationParams } from '../../common/utils/pagination';
import logger from '../../config/logger';

// ============================================================
// Types
// ============================================================

interface ListShiftsParams {
  startDate?: string;
  endDate?: string;
  locationId?: string;
  departmentId?: string;
  employeeId?: string;
  status?: ShiftStatus;
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: string;
}

interface CreateShiftInput {
  employeeId?: string;
  templateId?: string;
  locationId?: string;
  date: string;
  startTime: string;
  endTime: string;
  isOpenShift?: boolean;
  notes?: string;
}

interface UpdateShiftInput {
  employeeId?: string;
  templateId?: string;
  locationId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: ShiftStatus;
  isOpenShift?: boolean;
  notes?: string;
}

interface CreateSwapInput {
  originalShiftId: string;
  targetShiftId?: string;
  targetEmployeeId?: string;
  reason?: string;
}

interface CreateTemplateInput {
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  color?: string;
}

interface UpdateTemplateInput {
  name?: string;
  shiftType?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  color?: string;
  isActive?: boolean;
}

// Minimum rest between shifts in hours
const MIN_REST_HOURS = 8;

// ============================================================
// Service
// ============================================================

export class ShiftsService {
  // ----------------------------------------------------------
  // List shifts
  // ----------------------------------------------------------
  async listShifts(params: ListShiftsParams) {
    const pagination = parsePagination(params as Record<string, unknown>);
    const skip = (pagination.page - 1) * pagination.limit;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (params.startDate || params.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.startDate) dateFilter.gte = new Date(params.startDate);
      if (params.endDate) dateFilter.lte = new Date(params.endDate);
      where.date = dateFilter;
    }

    if (params.locationId) {
      where.locationId = params.locationId;
    }

    if (params.departmentId) {
      where.employee = {
        departmentId: params.departmentId,
      };
    }

    if (params.employeeId) {
      where.employeeId = params.employeeId;
    }

    if (params.status) {
      where.status = params.status;
    }

    // Determine sort field – only allow known columns
    const allowedSortFields = ['date', 'startTime', 'endTime', 'status', 'createdAt'];
    const sortBy = allowedSortFields.includes(pagination.sortBy ?? '')
      ? pagination.sortBy!
      : 'date';

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
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
          template: {
            select: { id: true, name: true, shiftType: true, color: true },
          },
          location: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.shift.count({ where }),
    ]);

    return buildPaginatedResult(shifts, total, pagination);
  }

  // ----------------------------------------------------------
  // Get single shift
  // ----------------------------------------------------------
  async getShift(id: string) {
    const shift = await prisma.shift.findFirst({
      where: { id, deletedAt: null },
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
        template: true,
        location: { select: { id: true, name: true } },
        swapRequests: {
          include: {
            targetShift: { select: { id: true, date: true, startTime: true, endTime: true } },
          },
        },
      },
    });

    return shift;
  }

  // ----------------------------------------------------------
  // Create shift
  // ----------------------------------------------------------
  async createShift(
    input: CreateShiftInput,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const { employeeId, templateId, locationId, date, startTime, endTime, isOpenShift, notes } =
      input;

    // Validate required fields
    if (!date || !startTime || !endTime) {
      return { success: false, error: 'date, startTime, and endTime are required' };
    }

    const shiftStart = new Date(startTime);
    const shiftEnd = new Date(endTime);

    if (shiftEnd <= shiftStart) {
      return { success: false, error: 'endTime must be after startTime' };
    }

    // Validate minimum rest between shifts for the employee
    if (employeeId) {
      const restViolation = await this.checkMinRestBetweenShifts(
        employeeId,
        shiftStart,
        shiftEnd
      );
      if (restViolation) {
        return {
          success: false,
          error: `Minimum rest period violation: employee must have at least ${MIN_REST_HOURS} hours rest between shifts. ${restViolation}`,
        };
      }
    }

    // Validate template if provided
    if (templateId) {
      const template = await prisma.shiftTemplate.findUnique({ where: { id: templateId } });
      if (!template) {
        return { success: false, error: 'Shift template not found' };
      }
    }

    // Validate location if provided
    if (locationId) {
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) {
        return { success: false, error: 'Location not found' };
      }
    }

    // Validate employee if provided
    if (employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) {
        return { success: false, error: 'Employee not found' };
      }
    }

    const shift = await prisma.shift.create({
      data: {
        employeeId: employeeId || null,
        templateId: templateId || null,
        locationId: locationId || null,
        date: new Date(date),
        startTime: shiftStart,
        endTime: shiftEnd,
        isOpenShift: isOpenShift ?? (!employeeId),
        status: isOpenShift || !employeeId ? ShiftStatus.OPEN : ShiftStatus.SCHEDULED,
        notes: notes || null,
        createdBy: actorId,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
        template: { select: { id: true, name: true, shiftType: true } },
        location: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      actorId,
      action: AuditAction.SHIFT_CREATED,
      objectType: 'Shift',
      objectId: shift.id,
      after: shift as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return { success: true, shift };
  }

  // ----------------------------------------------------------
  // Update shift
  // ----------------------------------------------------------
  async updateShift(
    id: string,
    input: UpdateShiftInput,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const existing = await prisma.shift.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return { success: false, error: 'Shift not found' };
    }

    // Determine new times for rest validation
    const newStart = input.startTime ? new Date(input.startTime) : existing.startTime;
    const newEnd = input.endTime ? new Date(input.endTime) : existing.endTime;

    if (newEnd <= newStart) {
      return { success: false, error: 'endTime must be after startTime' };
    }

    // Determine effective employee
    const effectiveEmployeeId =
      input.employeeId !== undefined ? input.employeeId : existing.employeeId;

    // Validate minimum rest if employee is assigned
    if (effectiveEmployeeId) {
      const restViolation = await this.checkMinRestBetweenShifts(
        effectiveEmployeeId,
        newStart,
        newEnd,
        id // exclude current shift from check
      );
      if (restViolation) {
        return {
          success: false,
          error: `Minimum rest period violation: employee must have at least ${MIN_REST_HOURS} hours rest between shifts. ${restViolation}`,
        };
      }
    }

    const data: Record<string, unknown> = {};
    if (input.employeeId !== undefined) data.employeeId = input.employeeId || null;
    if (input.templateId !== undefined) data.templateId = input.templateId || null;
    if (input.locationId !== undefined) data.locationId = input.locationId || null;
    if (input.date !== undefined) data.date = new Date(input.date);
    if (input.startTime !== undefined) data.startTime = new Date(input.startTime);
    if (input.endTime !== undefined) data.endTime = new Date(input.endTime);
    if (input.status !== undefined) data.status = input.status;
    if (input.isOpenShift !== undefined) data.isOpenShift = input.isOpenShift;
    if (input.notes !== undefined) data.notes = input.notes || null;

    const shift = await prisma.shift.update({
      where: { id },
      data,
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
        template: { select: { id: true, name: true, shiftType: true } },
        location: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      actorId,
      action: AuditAction.SHIFT_UPDATED,
      objectType: 'Shift',
      objectId: shift.id,
      before: existing as unknown as Record<string, unknown>,
      after: shift as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return { success: true, shift };
  }

  // ----------------------------------------------------------
  // Delete shift (soft delete)
  // ----------------------------------------------------------
  async deleteShift(id: string, actorId: string, ipAddress: string, userAgent: string) {
    const existing = await prisma.shift.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return { success: false, error: 'Shift not found' };
    }

    await prisma.shift.update({
      where: { id },
      data: { deletedAt: new Date(), status: ShiftStatus.CANCELLED },
    });

    await createAuditLog({
      actorId,
      action: AuditAction.SHIFT_DELETED,
      objectType: 'Shift',
      objectId: id,
      before: existing as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return { success: true };
  }

  // ----------------------------------------------------------
  // Open shifts – list available
  // ----------------------------------------------------------
  async listOpenShifts(params: ListShiftsParams) {
    const pagination = parsePagination(params as Record<string, unknown>);
    const skip = (pagination.page - 1) * pagination.limit;

    const where: Record<string, unknown> = {
      isOpenShift: true,
      status: ShiftStatus.OPEN,
      deletedAt: null,
      date: { gte: new Date() }, // only future open shifts
    };

    if (params.locationId) {
      where.locationId = params.locationId;
    }

    if (params.startDate || params.endDate) {
      const dateFilter: Record<string, Date> = { gte: new Date() };
      if (params.startDate) {
        const reqStart = new Date(params.startDate);
        if (reqStart > new Date()) dateFilter.gte = reqStart;
      }
      if (params.endDate) dateFilter.lte = new Date(params.endDate);
      where.date = dateFilter;
    }

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy: { date: 'asc' },
        include: {
          template: { select: { id: true, name: true, shiftType: true, color: true } },
          location: { select: { id: true, name: true } },
        },
      }),
      prisma.shift.count({ where }),
    ]);

    return buildPaginatedResult(shifts, total, pagination);
  }

  // ----------------------------------------------------------
  // Apply to open shift
  // ----------------------------------------------------------
  async applyToOpenShift(
    shiftId: string,
    employeeId: string,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, deletedAt: null },
    });

    if (!shift) {
      return { success: false, error: 'Shift not found' };
    }

    if (!shift.isOpenShift || shift.status !== ShiftStatus.OPEN) {
      return { success: false, error: 'This shift is not open for applications' };
    }

    if (shift.employeeId) {
      return { success: false, error: 'This shift has already been assigned' };
    }

    // Validate rest period for the applying employee
    const restViolation = await this.checkMinRestBetweenShifts(
      employeeId,
      shift.startTime,
      shift.endTime
    );
    if (restViolation) {
      return {
        success: false,
        error: `Cannot apply: minimum rest period violation. ${restViolation}`,
      };
    }

    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        employeeId,
        isOpenShift: false,
        status: ShiftStatus.SCHEDULED,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        template: { select: { id: true, name: true, shiftType: true } },
        location: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      actorId,
      action: AuditAction.SHIFT_UPDATED,
      objectType: 'Shift',
      objectId: shiftId,
      before: shift as unknown as Record<string, unknown>,
      after: updatedShift as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
      metadata: { action: 'applied_to_open_shift', employeeId },
    });

    return { success: true, shift: updatedShift };
  }

  // ----------------------------------------------------------
  // Create swap request
  // ----------------------------------------------------------
  async createSwapRequest(
    input: CreateSwapInput,
    requestedById: string,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const { originalShiftId, targetShiftId, targetEmployeeId, reason } = input;

    // Validate original shift exists and belongs to requester
    const originalShift = await prisma.shift.findFirst({
      where: { id: originalShiftId, deletedAt: null },
    });

    if (!originalShift) {
      return { success: false, error: 'Original shift not found' };
    }

    if (originalShift.employeeId !== requestedById) {
      return { success: false, error: 'You can only request swaps for your own shifts' };
    }

    if (originalShift.status === ShiftStatus.CANCELLED || originalShift.status === ShiftStatus.COMPLETED) {
      return { success: false, error: 'Cannot swap a cancelled or completed shift' };
    }

    // Validate target shift if provided
    if (targetShiftId) {
      const targetShift = await prisma.shift.findFirst({
        where: { id: targetShiftId, deletedAt: null },
      });
      if (!targetShift) {
        return { success: false, error: 'Target shift not found' };
      }
      if (targetShift.employeeId === requestedById) {
        return { success: false, error: 'Cannot swap with your own shift' };
      }
    }

    // Check for existing pending swap on this shift
    const existingSwap = await prisma.shiftSwap.findFirst({
      where: {
        originalShiftId,
        status: ApprovalStatus.PENDING,
      },
    });

    if (existingSwap) {
      return { success: false, error: 'A pending swap request already exists for this shift' };
    }

    const swap = await prisma.shiftSwap.create({
      data: {
        originalShiftId,
        targetShiftId: targetShiftId || null,
        requestedById,
        targetEmployeeId: targetEmployeeId || null,
        reason: reason || null,
        status: ApprovalStatus.PENDING,
      },
      include: {
        originalShift: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        targetShift: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    // Mark the original shift as swap-pending
    await prisma.shift.update({
      where: { id: originalShiftId },
      data: { status: ShiftStatus.SWAP_PENDING },
    });

    await createAuditLog({
      actorId,
      action: AuditAction.SHIFT_UPDATED,
      objectType: 'ShiftSwap',
      objectId: swap.id,
      after: swap as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
      metadata: { action: 'swap_requested' },
    });

    return { success: true, swap };
  }

  // ----------------------------------------------------------
  // Approve or reject swap request
  // ----------------------------------------------------------
  async resolveSwapRequest(
    swapId: string,
    decision: 'APPROVED' | 'REJECTED',
    approvedById: string,
    ipAddress: string,
    userAgent: string
  ) {
    const swap = await prisma.shiftSwap.findUnique({
      where: { id: swapId },
      include: {
        originalShift: true,
        targetShift: true,
      },
    });

    if (!swap) {
      return { success: false, error: 'Swap request not found' };
    }

    if (swap.status !== ApprovalStatus.PENDING) {
      return { success: false, error: 'Swap request is no longer pending' };
    }

    if (decision === 'APPROVED') {
      // Perform the swap within a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update swap status
        const updatedSwap = await tx.shiftSwap.update({
          where: { id: swapId },
          data: {
            status: ApprovalStatus.APPROVED,
            approvedById,
            approvedAt: new Date(),
          },
        });

        // If there is a target shift, swap the employees
        if (swap.targetShiftId && swap.targetShift) {
          const origEmployee = swap.originalShift.employeeId;
          const targetEmployee = swap.targetShift.employeeId;

          // Validate rest periods for both employees after swap
          if (targetEmployee) {
            const restViolation = await this.checkMinRestBetweenShifts(
              targetEmployee,
              swap.originalShift.startTime,
              swap.originalShift.endTime,
              swap.originalShiftId
            );
            if (restViolation) {
              throw new Error(
                `Rest violation for target employee: ${restViolation}`
              );
            }
          }
          if (origEmployee) {
            const restViolation = await this.checkMinRestBetweenShifts(
              origEmployee,
              swap.targetShift.startTime,
              swap.targetShift.endTime,
              swap.targetShiftId!
            );
            if (restViolation) {
              throw new Error(
                `Rest violation for original employee: ${restViolation}`
              );
            }
          }

          await tx.shift.update({
            where: { id: swap.originalShiftId },
            data: { employeeId: targetEmployee, status: ShiftStatus.SCHEDULED },
          });

          await tx.shift.update({
            where: { id: swap.targetShiftId },
            data: { employeeId: origEmployee, status: ShiftStatus.SCHEDULED },
          });
        } else {
          // No target shift – just revert original shift status
          await tx.shift.update({
            where: { id: swap.originalShiftId },
            data: { status: ShiftStatus.SCHEDULED },
          });
        }

        return updatedSwap;
      });

      await createAuditLog({
        actorId: approvedById,
        action: AuditAction.APPROVAL_GIVEN,
        objectType: 'ShiftSwap',
        objectId: swapId,
        after: result as unknown as Record<string, unknown>,
        ipAddress,
        userAgent,
        metadata: { decision: 'APPROVED' },
      });

      return { success: true, swap: result };
    } else {
      // Rejected
      const updatedSwap = await prisma.shiftSwap.update({
        where: { id: swapId },
        data: {
          status: ApprovalStatus.REJECTED,
          approvedById,
          approvedAt: new Date(),
        },
      });

      // Revert original shift status back to SCHEDULED
      await prisma.shift.update({
        where: { id: swap.originalShiftId },
        data: { status: ShiftStatus.SCHEDULED },
      });

      await createAuditLog({
        actorId: approvedById,
        action: AuditAction.APPROVAL_REJECTED,
        objectType: 'ShiftSwap',
        objectId: swapId,
        after: updatedSwap as unknown as Record<string, unknown>,
        ipAddress,
        userAgent,
        metadata: { decision: 'REJECTED' },
      });

      return { success: true, swap: updatedSwap };
    }
  }

  // ----------------------------------------------------------
  // Shift templates – list
  // ----------------------------------------------------------
  async listTemplates(activeOnly = true) {
    const where: Record<string, unknown> = {};
    if (activeOnly) where.isActive = true;

    const templates = await prisma.shiftTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return templates;
  }

  // ----------------------------------------------------------
  // Shift templates – create
  // ----------------------------------------------------------
  async createTemplate(input: CreateTemplateInput) {
    const { name, shiftType, startTime, endTime, breakMinutes, color } = input;

    if (!name || !shiftType || !startTime || !endTime) {
      return { success: false, error: 'name, shiftType, startTime, and endTime are required' };
    }

    // Validate time format HH:mm
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return { success: false, error: 'startTime and endTime must be in HH:mm format' };
    }

    const existing = await prisma.shiftTemplate.findFirst({
      where: { name },
    });
    if (existing) {
      return { success: false, error: 'A template with this name already exists' };
    }

    const template = await prisma.shiftTemplate.create({
      data: {
        name,
        shiftType: shiftType as any,
        startTime,
        endTime,
        breakMinutes: breakMinutes ?? 60,
        color: color || '#3B82F6',
      },
    });

    return { success: true, template };
  }

  // ----------------------------------------------------------
  // Shift templates – update
  // ----------------------------------------------------------
  async updateTemplate(id: string, input: UpdateTemplateInput) {
    const existing = await prisma.shiftTemplate.findUnique({ where: { id } });
    if (!existing) {
      return { success: false, error: 'Template not found' };
    }

    // If name is being changed, check for duplicates
    if (input.name && input.name !== existing.name) {
      const duplicate = await prisma.shiftTemplate.findFirst({
        where: { name: input.name, id: { not: id } },
      });
      if (duplicate) {
        return { success: false, error: 'A template with this name already exists' };
      }
    }

    // Validate time format if provided
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (input.startTime && !timeRegex.test(input.startTime)) {
      return { success: false, error: 'startTime must be in HH:mm format' };
    }
    if (input.endTime && !timeRegex.test(input.endTime)) {
      return { success: false, error: 'endTime must be in HH:mm format' };
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.shiftType !== undefined) data.shiftType = input.shiftType;
    if (input.startTime !== undefined) data.startTime = input.startTime;
    if (input.endTime !== undefined) data.endTime = input.endTime;
    if (input.breakMinutes !== undefined) data.breakMinutes = input.breakMinutes;
    if (input.color !== undefined) data.color = input.color;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const template = await prisma.shiftTemplate.update({
      where: { id },
      data,
    });

    return { success: true, template };
  }

  // ----------------------------------------------------------
  // Helper: check minimum rest between shifts
  // ----------------------------------------------------------
  private async checkMinRestBetweenShifts(
    employeeId: string,
    newStart: Date,
    newEnd: Date,
    excludeShiftId?: string
  ): Promise<string | null> {
    const minRestMs = MIN_REST_HOURS * 60 * 60 * 1000;

    // Look for shifts that would overlap with the rest window
    // Rest window before: (newStart - minRest) to newStart
    // Rest window after:  newEnd to (newEnd + minRest)
    const windowStart = new Date(newStart.getTime() - minRestMs);
    const windowEnd = new Date(newEnd.getTime() + minRestMs);

    const where: Record<string, unknown> = {
      employeeId,
      deletedAt: null,
      status: { not: ShiftStatus.CANCELLED },
      OR: [
        // Shift that ends within the rest-before window
        {
          endTime: { gt: windowStart, lte: newStart },
        },
        // Shift that starts within the rest-after window
        {
          startTime: { gte: newEnd, lt: windowEnd },
        },
      ],
    };

    if (excludeShiftId) {
      where.id = { not: excludeShiftId };
    }

    const conflicting = await prisma.shift.findFirst({
      where,
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
      },
    });

    if (!conflicting) return null;

    // Determine the actual gap
    const conflictEnd = conflicting.endTime.getTime();
    const conflictStart = conflicting.startTime.getTime();

    if (conflictEnd > windowStart.getTime() && conflictEnd <= newStart.getTime()) {
      const gapHours = ((newStart.getTime() - conflictEnd) / (1000 * 60 * 60)).toFixed(1);
      return `Only ${gapHours}h rest before shift (conflicting shift ends at ${conflicting.endTime.toISOString()})`;
    }

    if (conflictStart >= newEnd.getTime() && conflictStart < windowEnd.getTime()) {
      const gapHours = ((conflictStart - newEnd.getTime()) / (1000 * 60 * 60)).toFixed(1);
      return `Only ${gapHours}h rest after shift (conflicting shift starts at ${conflicting.startTime.toISOString()})`;
    }

    return `Conflicting shift found (ID: ${conflicting.id})`;
  }
}

export const shiftsService = new ShiftsService();
