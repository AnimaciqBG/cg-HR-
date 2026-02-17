import prisma from '../../config/database';
import { AuditAction, TimeEntryType, ApprovalStatus } from '@prisma/client';
import { createAuditLog } from '../../common/utils/audit';
import { parsePagination, buildPaginatedResult, PaginationParams } from '../../common/utils/pagination';
import logger from '../../config/logger';

// ============================================================
// Types
// ============================================================

interface ClockInput {
  employeeId: string;
  ipAddress: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

interface ListTimeEntriesParams {
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: string;
}

interface CorrectionInput {
  employeeId: string;
  type: TimeEntryType;
  timestamp: string;
  notes?: string;
}

// Standard work day constants
const STANDARD_DAILY_HOURS = 8;
const STANDARD_MONTHLY_HOURS = 160;

// ============================================================
// Service
// ============================================================

export class TimeEntriesService {
  // ----------------------------------------------------------
  // Clock In
  // ----------------------------------------------------------
  async clockIn(
    input: ClockInput,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const { employeeId, latitude, longitude, notes } = input;

    // Validate employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // Validate no active clock-in exists (last entry should not be CLOCK_IN)
    const lastEntry = await prisma.timeEntry.findFirst({
      where: { employeeId },
      orderBy: { timestamp: 'desc' },
    });

    if (
      lastEntry &&
      lastEntry.type === TimeEntryType.CLOCK_IN
    ) {
      return {
        success: false,
        error: 'Already clocked in. Please clock out before clocking in again.',
      };
    }

    const timeEntry = await prisma.timeEntry.create({
      data: {
        employeeId,
        type: TimeEntryType.CLOCK_IN,
        timestamp: new Date(),
        ipAddress: input.ipAddress,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        isManual: false,
        notes: notes || null,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    });

    await createAuditLog({
      actorId,
      action: AuditAction.TIME_CLOCK_IN,
      objectType: 'TimeEntry',
      objectId: timeEntry.id,
      after: timeEntry as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return { success: true, timeEntry };
  }

  // ----------------------------------------------------------
  // Clock Out
  // ----------------------------------------------------------
  async clockOut(
    input: ClockInput,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const { employeeId, latitude, longitude, notes } = input;

    // Validate employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // Validate an active clock-in exists (last entry must be CLOCK_IN)
    const lastEntry = await prisma.timeEntry.findFirst({
      where: { employeeId },
      orderBy: { timestamp: 'desc' },
    });

    if (!lastEntry || lastEntry.type !== TimeEntryType.CLOCK_IN) {
      return {
        success: false,
        error: 'No active clock-in found. Please clock in before clocking out.',
      };
    }

    const timeEntry = await prisma.timeEntry.create({
      data: {
        employeeId,
        type: TimeEntryType.CLOCK_OUT,
        timestamp: new Date(),
        ipAddress: input.ipAddress,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        isManual: false,
        notes: notes || null,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    });

    await createAuditLog({
      actorId,
      action: AuditAction.TIME_CLOCK_OUT,
      objectType: 'TimeEntry',
      objectId: timeEntry.id,
      after: timeEntry as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return { success: true, timeEntry };
  }

  // ----------------------------------------------------------
  // Get Time Entries (paginated list with filters)
  // ----------------------------------------------------------
  async getTimeEntries(params: ListTimeEntriesParams) {
    const pagination = parsePagination(params as Record<string, unknown>);
    const skip = (pagination.page - 1) * pagination.limit;

    const where: Record<string, unknown> = {};

    if (params.employeeId) {
      where.employeeId = params.employeeId;
    }

    if (params.dateFrom || params.dateTo) {
      const timestampFilter: Record<string, Date> = {};
      if (params.dateFrom) timestampFilter.gte = new Date(params.dateFrom);
      if (params.dateTo) timestampFilter.lte = new Date(params.dateTo);
      where.timestamp = timestampFilter;
    }

    // Determine sort field – only allow known columns
    const allowedSortFields = ['timestamp', 'type', 'createdAt'];
    const sortBy = allowedSortFields.includes(pagination.sortBy ?? '')
      ? pagination.sortBy!
      : 'timestamp';

    const [entries, total] = await Promise.all([
      prisma.timeEntry.findMany({
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
              employeeNumber: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.timeEntry.count({ where }),
    ]);

    return buildPaginatedResult(entries, total, pagination);
  }

  // ----------------------------------------------------------
  // Get Monthly Timesheet
  // ----------------------------------------------------------
  async getMonthlyTimesheet(employeeId: string, year: number, month: number) {
    // Validate employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        weeklyHours: true,
      },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // Build date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const entries = await prisma.timeEntry.findMany({
      where: {
        employeeId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Group entries by day and calculate hours
    const dailyMap = new Map<string, { date: string; entries: typeof entries; totalHours: number; overtime: number }>();

    for (const entry of entries) {
      const dayKey = entry.timestamp.toISOString().split('T')[0];
      if (!dailyMap.has(dayKey)) {
        dailyMap.set(dayKey, { date: dayKey, entries: [], totalHours: 0, overtime: 0 });
      }
      dailyMap.get(dayKey)!.entries.push(entry);
    }

    // Calculate hours for each day from CLOCK_IN / CLOCK_OUT pairs
    let totalMonthlyHours = 0;
    let totalMonthlyOvertime = 0;

    for (const [, dayData] of dailyMap) {
      let dayHours = 0;
      let clockInTime: Date | null = null;

      for (const entry of dayData.entries) {
        if (entry.type === TimeEntryType.CLOCK_IN) {
          clockInTime = entry.timestamp;
        } else if (entry.type === TimeEntryType.CLOCK_OUT && clockInTime) {
          const diffMs = entry.timestamp.getTime() - clockInTime.getTime();
          dayHours += diffMs / (1000 * 60 * 60);
          clockInTime = null;
        }
      }

      // Round to 2 decimal places
      dayData.totalHours = Math.round(dayHours * 100) / 100;
      dayData.overtime = Math.max(0, Math.round((dayHours - STANDARD_DAILY_HOURS) * 100) / 100);
      totalMonthlyHours += dayData.totalHours;
      totalMonthlyOvertime += dayData.overtime;
    }

    // Build sorted daily breakdown
    const days = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      timesheet: {
        employee: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeNumber: employee.employeeNumber,
        },
        year,
        month,
        summary: {
          totalHours: Math.round(totalMonthlyHours * 100) / 100,
          totalOvertime: Math.round(totalMonthlyOvertime * 100) / 100,
          standardHours: STANDARD_MONTHLY_HOURS,
          workingDays: days.length,
        },
        days,
      },
    };
  }

  // ----------------------------------------------------------
  // Submit Correction (manual punch requiring approval)
  // ----------------------------------------------------------
  async submitCorrection(
    input: CorrectionInput,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const { employeeId, type, timestamp, notes } = input;

    // Validate required fields
    if (!type || !timestamp) {
      return { success: false, error: 'type and timestamp are required' };
    }

    // Validate type is a valid clock type
    if (![TimeEntryType.CLOCK_IN, TimeEntryType.CLOCK_OUT].includes(type)) {
      return { success: false, error: 'type must be CLOCK_IN or CLOCK_OUT' };
    }

    // Validate employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // Validate timestamp is not in the future
    const correctionTimestamp = new Date(timestamp);
    if (correctionTimestamp > new Date()) {
      return { success: false, error: 'Correction timestamp cannot be in the future' };
    }

    const timeEntry = await prisma.timeEntry.create({
      data: {
        employeeId,
        type,
        timestamp: correctionTimestamp,
        isManual: true,
        notes: notes || null,
        // approvedById remains null – needs approval
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    });

    await createAuditLog({
      actorId,
      action: type === TimeEntryType.CLOCK_IN ? AuditAction.TIME_CLOCK_IN : AuditAction.TIME_CLOCK_OUT,
      objectType: 'TimeEntry',
      objectId: timeEntry.id,
      after: timeEntry as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
      metadata: { isCorrection: true },
    });

    return { success: true, timeEntry };
  }

  // ----------------------------------------------------------
  // Approve Correction
  // ----------------------------------------------------------
  async approveCorrection(
    id: string,
    approverId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id },
    });

    if (!timeEntry) {
      return { success: false, error: 'Time entry not found' };
    }

    if (!timeEntry.isManual) {
      return { success: false, error: 'Only manual corrections can be approved' };
    }

    if (timeEntry.approvedById) {
      return { success: false, error: 'This correction has already been approved' };
    }

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: {
        approvedById: approverId,
        approvedAt: new Date(),
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    });

    await createAuditLog({
      actorId: approverId,
      action: AuditAction.APPROVAL_GIVEN,
      objectType: 'TimeEntry',
      objectId: id,
      before: timeEntry as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
      metadata: { action: 'correction_approved' },
    });

    return { success: true, timeEntry: updated };
  }
}

export const timeEntriesService = new TimeEntriesService();
