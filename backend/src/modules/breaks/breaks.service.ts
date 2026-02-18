import prisma from '../../config/database';
import { AuditAction, BreakCategory, BreakStatus } from '@prisma/client';
import { createAuditLog } from '../../common/utils/audit';
import { parsePagination, buildPaginatedResult, PaginationParams } from '../../common/utils/pagination';
import logger from '../../config/logger';

// ============================================================
// Types
// ============================================================

interface StartBreakInput {
  employeeId: string;
  category: BreakCategory;
  notes?: string;
}

interface ListBreaksParams {
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: BreakCategory;
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: string;
}

// Default break policy limits (used when no active BreakPolicy is found)
const DEFAULT_MAX_BREAKS_PER_DAY = 5;
const DEFAULT_MAX_MINUTES_PER_BREAK = 30;
const DEFAULT_MAX_TOTAL_MINUTES = 45;

// ============================================================
// Service
// ============================================================

export class BreaksService {
  // ----------------------------------------------------------
  // Helper: get active break policy
  // ----------------------------------------------------------
  private async getActiveBreakPolicy() {
    const policy = await prisma.breakPolicy.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      maxBreaksPerDay: policy?.maxBreaksPerDay ?? DEFAULT_MAX_BREAKS_PER_DAY,
      maxMinutesPerBreak: policy?.maxMinutesPerBreak ?? DEFAULT_MAX_MINUTES_PER_BREAK,
      maxTotalMinutes: policy?.maxTotalMinutes ?? DEFAULT_MAX_TOTAL_MINUTES,
      alertOnExceed: policy?.alertOnExceed ?? true,
    };
  }

  // ----------------------------------------------------------
  // Helper: get today's start/end for querying
  // ----------------------------------------------------------
  private getTodayRange(): { startOfDay: Date; endOfDay: Date } {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { startOfDay, endOfDay };
  }

  // ----------------------------------------------------------
  // Start Break
  // ----------------------------------------------------------
  async startBreak(
    input: StartBreakInput,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const { employeeId, category, notes } = input;

    // Validate employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // Validate no active break exists
    const activeBreak = await prisma.break.findFirst({
      where: {
        employeeId,
        status: BreakStatus.ACTIVE,
      },
    });

    if (activeBreak) {
      return {
        success: false,
        error: 'An active break is already in progress. Please end the current break first.',
      };
    }

    // Check maxBreaksPerDay limit
    const policy = await this.getActiveBreakPolicy();
    const { startOfDay, endOfDay } = this.getTodayRange();

    const todayBreakCount = await prisma.break.count({
      where: {
        employeeId,
        startTime: { gte: startOfDay, lte: endOfDay },
      },
    });

    if (todayBreakCount >= policy.maxBreaksPerDay) {
      return {
        success: false,
        error: `Maximum breaks per day (${policy.maxBreaksPerDay}) exceeded. Cannot start another break.`,
      };
    }

    const breakRecord = await prisma.break.create({
      data: {
        employeeId,
        category,
        startTime: new Date(),
        status: BreakStatus.ACTIVE,
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
      action: AuditAction.BREAK_STARTED,
      objectType: 'Break',
      objectId: breakRecord.id,
      after: breakRecord as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    return { success: true, break: breakRecord };
  }

  // ----------------------------------------------------------
  // End Break
  // ----------------------------------------------------------
  async endBreak(
    breakId: string,
    employeeId: string,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ) {
    const breakRecord = await prisma.break.findFirst({
      where: {
        id: breakId,
        employeeId,
        status: BreakStatus.ACTIVE,
      },
    });

    if (!breakRecord) {
      return { success: false, error: 'Active break not found' };
    }

    const now = new Date();
    const durationMs = now.getTime() - breakRecord.startTime.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    // Check if break exceeded the per-break limit
    const policy = await this.getActiveBreakPolicy();
    const exceeded = durationMinutes > policy.maxMinutesPerBreak;

    const updatedBreak = await prisma.break.update({
      where: { id: breakId },
      data: {
        endTime: now,
        duration: durationMinutes,
        status: exceeded ? BreakStatus.EXCEEDED : BreakStatus.COMPLETED,
        exceededAt: exceeded ? now : null,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    });

    await createAuditLog({
      actorId,
      action: exceeded ? AuditAction.BREAK_EXCEEDED : AuditAction.BREAK_ENDED,
      objectType: 'Break',
      objectId: breakId,
      before: breakRecord as unknown as Record<string, unknown>,
      after: updatedBreak as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
      metadata: { durationMinutes, exceeded },
    });

    return { success: true, break: updatedBreak, exceeded, durationMinutes };
  }

  // ----------------------------------------------------------
  // Get Active Break
  // ----------------------------------------------------------
  async getActiveBreak(employeeId: string) {
    const activeBreak = await prisma.break.findFirst({
      where: {
        employeeId,
        status: BreakStatus.ACTIVE,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    });

    return activeBreak;
  }

  // ----------------------------------------------------------
  // Get Breaks (paginated list with filters)
  // ----------------------------------------------------------
  async getBreaks(params: ListBreaksParams) {
    const pagination = parsePagination(params as Record<string, unknown>);
    const skip = (pagination.page - 1) * pagination.limit;

    const where: Record<string, unknown> = {};

    if (params.employeeId) {
      where.employeeId = params.employeeId;
    }

    if (params.category) {
      where.category = params.category;
    }

    if (params.dateFrom || params.dateTo) {
      const startTimeFilter: Record<string, Date> = {};
      if (params.dateFrom) startTimeFilter.gte = new Date(params.dateFrom);
      if (params.dateTo) startTimeFilter.lte = new Date(params.dateTo);
      where.startTime = startTimeFilter;
    }

    // Determine sort field – only allow known columns
    const allowedSortFields = ['startTime', 'endTime', 'duration', 'category', 'status', 'createdAt'];
    const sortBy = allowedSortFields.includes(pagination.sortBy ?? '')
      ? pagination.sortBy!
      : 'startTime';

    const [breaks, total] = await Promise.all([
      prisma.break.findMany({
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
      prisma.break.count({ where }),
    ]);

    return buildPaginatedResult(breaks, total, pagination);
  }

  // ----------------------------------------------------------
  // Get Break Summary (totals by category)
  // ----------------------------------------------------------
  async getBreakSummary(employeeId: string, dateFrom: string, dateTo: string) {
    // Validate employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
      },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    const where: Record<string, unknown> = {
      employeeId,
      status: { not: BreakStatus.ACTIVE },
    };

    if (dateFrom || dateTo) {
      const startTimeFilter: Record<string, Date> = {};
      if (dateFrom) startTimeFilter.gte = new Date(dateFrom);
      if (dateTo) startTimeFilter.lte = new Date(dateTo);
      where.startTime = startTimeFilter;
    }

    // Aggregate by category
    const aggregations = await prisma.break.groupBy({
      by: ['category'],
      where,
      _count: { id: true },
      _sum: { duration: true },
      _avg: { duration: true },
      _max: { duration: true },
    });

    // Total across all categories
    const totalBreaks = aggregations.reduce((sum, agg) => sum + agg._count.id, 0);
    const totalMinutes = aggregations.reduce((sum, agg) => sum + (agg._sum.duration || 0), 0);

    // Count exceeded breaks
    const exceededCount = await prisma.break.count({
      where: {
        ...where,
        status: BreakStatus.EXCEEDED,
      },
    });

    const byCategory = aggregations.map((agg) => ({
      category: agg.category,
      count: agg._count.id,
      totalMinutes: agg._sum.duration || 0,
      averageMinutes: Math.round((agg._avg.duration || 0) * 100) / 100,
      maxMinutes: agg._max.duration || 0,
    }));

    return {
      success: true,
      summary: {
        employee: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeNumber: employee.employeeNumber,
        },
        dateFrom,
        dateTo,
        totalBreaks,
        totalMinutes,
        exceededCount,
        byCategory,
      },
    };
  }

  // ----------------------------------------------------------
  // Check Break Limits
  // ----------------------------------------------------------
  async checkBreakLimits(employeeId: string) {
    const policy = await this.getActiveBreakPolicy();
    const { startOfDay, endOfDay } = this.getTodayRange();

    // Get today's breaks
    const todayBreaks = await prisma.break.findMany({
      where: {
        employeeId,
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { startTime: 'asc' },
    });

    const breakCount = todayBreaks.length;
    const completedBreaks = todayBreaks.filter((b) => b.status !== BreakStatus.ACTIVE);
    const totalMinutesUsed = completedBreaks.reduce((sum, b) => sum + (b.duration || 0), 0);

    // Check for an active break and calculate its running duration
    const activeBreak = todayBreaks.find((b) => b.status === BreakStatus.ACTIVE);
    let activeBreakDuration = 0;
    if (activeBreak) {
      activeBreakDuration = Math.round(
        (new Date().getTime() - activeBreak.startTime.getTime()) / (1000 * 60)
      );
    }

    const effectiveTotalMinutes = totalMinutesUsed + activeBreakDuration;
    const exceededCount = todayBreaks.filter((b) => b.status === BreakStatus.EXCEEDED).length;

    return {
      employeeId,
      date: startOfDay.toISOString().split('T')[0],
      policy: {
        maxBreaksPerDay: policy.maxBreaksPerDay,
        maxMinutesPerBreak: policy.maxMinutesPerBreak,
        maxTotalMinutes: policy.maxTotalMinutes,
      },
      usage: {
        breaksTaken: breakCount,
        breaksRemaining: Math.max(0, policy.maxBreaksPerDay - breakCount),
        totalMinutesUsed: effectiveTotalMinutes,
        totalMinutesRemaining: Math.max(0, policy.maxTotalMinutes - effectiveTotalMinutes),
        exceededCount,
        hasActiveBreak: !!activeBreak,
        activeBreakDuration,
      },
      limits: {
        breaksExceeded: breakCount >= policy.maxBreaksPerDay,
        totalTimeExceeded: effectiveTotalMinutes >= policy.maxTotalMinutes,
        currentBreakExceeded: activeBreakDuration > policy.maxMinutesPerBreak,
      },
    };
  }
}

export const breaksService = new BreaksService();
