import {
  AuditAction,
  EmploymentStatus,
  ContractType,
  UserRole,
  UserStatus,
  Prisma,
} from '@prisma/client';
import prisma from '../../config/database';
import { createAuditLog } from '../../common/utils/audit';
import { hasPermission, Permission } from '../../common/guards/rbac.guard';
import {
  PaginationParams,
  PaginatedResult,
  buildPaginatedResult,
} from '../../common/utils/pagination';
import { getLicenseStatus } from '../../common/utils/license';
import logger from '../../config/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListEmployeesParams {
  pagination: PaginationParams;
  filters: {
    departmentId?: string;
    locationId?: string;
    employmentStatus?: EmploymentStatus;
    contractType?: ContractType;
    managerId?: string;
    search?: string;
  };
  /** The user making the request – needed for RBAC scoping */
  actor: {
    id: string;
    role: UserRole;
    employeeId?: string;
  };
}

interface CreateEmployeeData {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth?: Date;
  personalId?: string;
  phone?: string;
  personalEmail?: string;
  address?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  photoUrl?: string;
  departmentId?: string;
  locationId?: string;
  jobTitle: string;
  managerId?: string;
  contractType?: ContractType;
  employmentStatus?: EmploymentStatus;
  hireDate: Date;
  probationEndDate?: Date;
  weeklyHours?: number;
  salary?: number;
  hourlyRate?: number;
  currency?: string;
  /** User-account fields (optional – when creating a user at the same time) */
  email?: string;
  role?: UserRole;
}

interface UpdateEmployeeData {
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  dateOfBirth?: Date | null;
  personalId?: string | null;
  phone?: string | null;
  personalEmail?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  photoUrl?: string | null;
  departmentId?: string | null;
  locationId?: string | null;
  jobTitle?: string;
  managerId?: string | null;
  contractType?: ContractType;
  employmentStatus?: EmploymentStatus;
  hireDate?: Date;
  probationEndDate?: Date | null;
  terminationDate?: Date | null;
  weeklyHours?: number;
  salary?: number | null;
  hourlyRate?: number | null;
  currency?: string;
}

// Fields that are safe for every authenticated user to see about any employee
const PUBLIC_EMPLOYEE_SELECT = {
  id: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  middleName: true,
  photoUrl: true,
  jobTitle: true,
  departmentId: true,
  locationId: true,
  managerId: true,
  employmentStatus: true,
  contractType: true,
  hireDate: true,
  department: { select: { id: true, name: true, code: true } },
  location: { select: { id: true, name: true, code: true } },
  manager: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
} satisfies Prisma.EmployeeSelect;

// Extended fields visible to HR / Admin or the employee themselves
const DETAILED_EMPLOYEE_SELECT = {
  ...PUBLIC_EMPLOYEE_SELECT,
  userId: true,
  dateOfBirth: true,
  personalId: true,
  phone: true,
  personalEmail: true,
  address: true,
  emergencyContact: true,
  emergencyPhone: true,
  probationEndDate: true,
  terminationDate: true,
  weeklyHours: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  user: {
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
      twoFactorEnabled: true,
    },
  },
  subordinates: {
    select: { id: true, firstName: true, lastName: true, jobTitle: true, photoUrl: true },
  },
} satisfies Prisma.EmployeeSelect;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class EmployeesService {
  // -----------------------------------------------------------------------
  // LIST
  // -----------------------------------------------------------------------

  async listEmployees(
    params: ListEmployeesParams
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const { pagination, filters, actor } = params;

    // -- Build the WHERE clause --
    const where: Prisma.EmployeeWhereInput = { deletedAt: null };

    // RBAC scoping
    if (hasPermission(actor.role, 'employees:read_all')) {
      // HR / Admin / Super-Admin / Payroll-Admin: see everyone
    } else if (hasPermission(actor.role, 'employees:read_team')) {
      // Team lead: see own record + direct subordinates
      where.OR = [
        { id: actor.employeeId },
        { managerId: actor.employeeId },
      ];
    } else {
      // Regular employee: see only self
      where.id = actor.employeeId;
    }

    // Filters
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.employmentStatus) where.employmentStatus = filters.employmentStatus;
    if (filters.contractType) where.contractType = filters.contractType;
    if (filters.managerId) where.managerId = filters.managerId;

    if (filters.search) {
      const term = filters.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { employeeNumber: { contains: term, mode: 'insensitive' } },
            { jobTitle: { contains: term, mode: 'insensitive' } },
            { personalEmail: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    // -- Allowed sort fields --
    const allowedSortFields = [
      'firstName',
      'lastName',
      'employeeNumber',
      'hireDate',
      'jobTitle',
      'createdAt',
      'updatedAt',
    ];
    const sortBy = allowedSortFields.includes(pagination.sortBy ?? '')
      ? pagination.sortBy!
      : 'lastName';
    const orderBy = { [sortBy]: pagination.sortOrder ?? 'asc' };

    // -- Query --
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: PUBLIC_EMPLOYEE_SELECT,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy,
      }),
      prisma.employee.count({ where }),
    ]);

    return buildPaginatedResult(
      employees as unknown as Record<string, unknown>[],
      total,
      pagination
    );
  }

  // -----------------------------------------------------------------------
  // GET BY ID
  // -----------------------------------------------------------------------

  async getEmployeeById(
    employeeId: string,
    actor: { id: string; role: UserRole; employeeId?: string }
  ): Promise<Record<string, unknown> | null> {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: DETAILED_EMPLOYEE_SELECT,
    });

    if (!employee) return null;

    // RBAC check
    const isSelf = actor.employeeId === employeeId;
    const canReadAll = hasPermission(actor.role, 'employees:read_all');
    const canReadTeam = hasPermission(actor.role, 'employees:read_team');
    const isSubordinate = employee.managerId === actor.employeeId;

    if (!isSelf && !canReadAll && !(canReadTeam && isSubordinate)) {
      return null; // Caller will translate to 403
    }

    // Build result – mask salary fields unless permitted
    const result: Record<string, unknown> = { ...employee };

    const canReadSalary = hasPermission(actor.role, 'salary:read') || isSelf;
    if (canReadSalary) {
      // Fetch salary data separately (not in default select to avoid leaking)
      const salaryData = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { salary: true, hourlyRate: true },
      });
      result.salary = salaryData?.salary ?? null;
      result.hourlyRate = salaryData?.hourlyRate ?? null;
    } else {
      result.salary = undefined;
      result.hourlyRate = undefined;
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // CREATE
  // -----------------------------------------------------------------------

  async createEmployee(
    data: CreateEmployeeData,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{ success: boolean; employee?: Record<string, unknown>; error?: string }> {
    // License check
    const license = await getLicenseStatus();
    if (!license.canAddUser) {
      return {
        success: false,
        error: `User limit reached (${license.activeUsers}/${license.maxUsers}). Cannot create new employee.`,
      };
    }

    // Generate employee number
    const count = await prisma.employee.count();
    const employeeNumber = `EMP${String(count + 1).padStart(5, '0')}`;

    try {
      const userEmail = data.email
        ? data.email.toLowerCase()
        : `${employeeNumber.toLowerCase()}@placeholder.local`;

      const employee = await prisma.employee.create({
        data: {
          employeeNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName,
          dateOfBirth: data.dateOfBirth,
          personalId: data.personalId,
          phone: data.phone,
          personalEmail: data.personalEmail,
          address: data.address,
          emergencyContact: data.emergencyContact,
          emergencyPhone: data.emergencyPhone,
          photoUrl: data.photoUrl,
          ...(data.departmentId ? { department: { connect: { id: data.departmentId } } } : {}),
          ...(data.locationId ? { location: { connect: { id: data.locationId } } } : {}),
          jobTitle: data.jobTitle,
          ...(data.managerId ? { manager: { connect: { id: data.managerId } } } : {}),
          contractType: data.contractType ?? ContractType.FULL_TIME,
          employmentStatus: data.employmentStatus ?? EmploymentStatus.ACTIVE,
          hireDate: data.hireDate,
          probationEndDate: data.probationEndDate,
          weeklyHours: data.weeklyHours ?? 40,
          salary: data.salary,
          hourlyRate: data.hourlyRate,
          currency: data.currency ?? 'BGN',
          createdBy: actorId,
          user: {
            create: {
              email: userEmail,
              passwordHash: '',
              role: data.role ?? UserRole.EMPLOYEE,
              status: UserStatus.PENDING_ACTIVATION,
              mustChangePassword: true,
            },
          },
        },
        select: DETAILED_EMPLOYEE_SELECT,
      });

      await createAuditLog({
        actorId,
        action: AuditAction.EMPLOYEE_CREATED,
        objectType: 'Employee',
        objectId: employee.id,
        after: {
          employeeNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          jobTitle: data.jobTitle,
          departmentId: data.departmentId,
          locationId: data.locationId,
        },
        ipAddress,
        userAgent,
      });

      return { success: true, employee: employee as unknown as Record<string, unknown> };
    } catch (error) {
      logger.error('Failed to create employee', { error });

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { success: false, error: 'Duplicate entry. Email or employee number already exists.' };
      }

      return { success: false, error: 'Failed to create employee' };
    }
  }

  // -----------------------------------------------------------------------
  // UPDATE
  // -----------------------------------------------------------------------

  async updateEmployee(
    employeeId: string,
    data: UpdateEmployeeData,
    actor: { id: string; role: UserRole; employeeId?: string },
    ipAddress: string,
    userAgent: string
  ): Promise<{ success: boolean; employee?: Record<string, unknown>; error?: string }> {
    // Fetch current state for RBAC & audit diff
    const existing = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });

    if (!existing) {
      return { success: false, error: 'Employee not found' };
    }

    // RBAC: who can update?
    const isSelf = actor.employeeId === employeeId;
    const canWriteAll = hasPermission(actor.role, 'employees:write_all');
    const isSubordinate = existing.managerId === actor.employeeId;
    const canWriteTeam =
      hasPermission(actor.role, 'employees:read_team') && isSubordinate;

    if (!canWriteAll && !isSelf && !canWriteTeam) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Self-service: employees can only update a limited set of personal fields
    const selfAllowedFields = new Set([
      'phone',
      'personalEmail',
      'address',
      'emergencyContact',
      'emergencyPhone',
      'photoUrl',
    ]);

    if (isSelf && !canWriteAll) {
      const keys = Object.keys(data) as (keyof UpdateEmployeeData)[];
      const forbidden = keys.filter((k) => !selfAllowedFields.has(k));
      if (forbidden.length > 0) {
        return {
          success: false,
          error: `You do not have permission to update: ${forbidden.join(', ')}`,
        };
      }
    }

    // Salary fields require salary:write permission
    if (
      (data.salary !== undefined || data.hourlyRate !== undefined) &&
      !hasPermission(actor.role, 'salary:write')
    ) {
      return { success: false, error: 'Salary write permission required' };
    }

    // Snapshot before-state for audit
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(data) as (keyof UpdateEmployeeData)[]) {
      if (data[key] !== undefined) {
        before[key] = (existing as Record<string, unknown>)[key];
        after[key] = data[key];
      }
    }

    try {
      const employee = await prisma.employee.update({
        where: { id: employeeId },
        data: {
          ...data,
          updatedBy: actor.id,
        },
        select: DETAILED_EMPLOYEE_SELECT,
      });

      await createAuditLog({
        actorId: actor.id,
        action: AuditAction.EMPLOYEE_UPDATED,
        objectType: 'Employee',
        objectId: employeeId,
        before,
        after,
        ipAddress,
        userAgent,
      });

      return { success: true, employee: employee as unknown as Record<string, unknown> };
    } catch (error) {
      logger.error('Failed to update employee', { error, employeeId });
      return { success: false, error: 'Failed to update employee' };
    }
  }

  // -----------------------------------------------------------------------
  // ORG CHART
  // -----------------------------------------------------------------------

  async getOrgChart(): Promise<Record<string, unknown>[]> {
    const employees = await prisma.employee.findMany({
      where: { deletedAt: null, employmentStatus: { not: EmploymentStatus.TERMINATED } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        photoUrl: true,
        managerId: true,
        employmentStatus: true,
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { lastName: 'asc' },
    });

    // Build a tree structure
    type OrgNode = (typeof employees)[number] & { children: OrgNode[] };
    const nodeMap = new Map<string, OrgNode>();
    const roots: OrgNode[] = [];

    for (const emp of employees) {
      nodeMap.set(emp.id, { ...emp, children: [] });
    }

    for (const emp of employees) {
      const node = nodeMap.get(emp.id)!;
      if (emp.managerId && nodeMap.has(emp.managerId)) {
        nodeMap.get(emp.managerId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots as unknown as Record<string, unknown>[];
  }

  // -----------------------------------------------------------------------
  // TIMELINE (audit history)
  // -----------------------------------------------------------------------

  async getEmployeeTimeline(
    employeeId: string,
    actor: { id: string; role: UserRole; employeeId?: string },
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedResult<Record<string, unknown>> | null> {
    // Verify the employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true, managerId: true },
    });

    if (!employee) return null;

    // RBAC
    const isSelf = actor.employeeId === employeeId;
    const canReadAll = hasPermission(actor.role, 'employees:read_all');
    const isSubordinate = employee.managerId === actor.employeeId;
    const canReadTeam = hasPermission(actor.role, 'employees:read_team');

    if (!isSelf && !canReadAll && !(canReadTeam && isSubordinate)) {
      return null;
    }

    const where: Prisma.AuditLogWhereInput = {
      objectType: 'Employee',
      objectId: employeeId,
    };

    // If the actor is a regular employee viewing their own timeline, hide
    // salary-related audit entries unless they have salary:read permission.
    if (!hasPermission(actor.role, 'salary:read') && isSelf) {
      where.action = { notIn: [AuditAction.SALARY_VIEWED] };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          before: true,
          after: true,
          createdAt: true,
          ipAddress: true,
          metadata: true,
          actor: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Mask salary values in before/after diffs when the viewer lacks permission
    const canSeeSalary = hasPermission(actor.role, 'salary:read');
    const sanitisedLogs = logs.map((log) => {
      if (!canSeeSalary) {
        const maskSalaryFields = (obj: unknown): unknown => {
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            const record = obj as Record<string, unknown>;
            const masked = { ...record };
            if ('salary' in masked) masked.salary = '***';
            if ('hourlyRate' in masked) masked.hourlyRate = '***';
            return masked;
          }
          return obj;
        };
        return {
          ...log,
          before: maskSalaryFields(log.before),
          after: maskSalaryFields(log.after),
        };
      }
      return log;
    });

    return buildPaginatedResult(
      sanitisedLogs as unknown as Record<string, unknown>[],
      total,
      { page, limit, sortBy: 'createdAt', sortOrder: 'desc' }
    );
  }
}

export const employeesService = new EmployeesService();
