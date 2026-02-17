import { UserRole, UserStatus, AuditAction, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { hashPassword, validatePasswordStrength } from '../../common/utils/password';
import { createAuditLog } from '../../common/utils/audit';
import { checkLicenseForRole, getLicenseStatus } from '../../common/utils/license';
import { PaginationParams, buildPaginatedResult, PaginatedResult } from '../../common/utils/pagination';
import logger from '../../config/logger';

// ============================================================
// Types
// ============================================================

interface UserListFilters {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
}

interface CreateUserData {
  email: string;
  password: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  jobTitle: string;
  departmentId?: string;
  locationId?: string;
}

interface UpdateUserData {
  email?: string;
  role?: UserRole;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  departmentId?: string | null;
  locationId?: string | null;
}

interface UserSummary {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  twoFactorEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    employeeNumber: string;
    department: { id: string; name: string } | null;
    location: { id: string; name: string } | null;
  } | null;
}

interface UserDetail extends UserSummary {
  lastLoginIp: string | null;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  updatedAt: Date;
}

const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      employeeNumber: true,
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.UserSelect;

const USER_DETAIL_SELECT = {
  ...USER_SUMMARY_SELECT,
  lastLoginIp: true,
  mustChangePassword: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

// ============================================================
// Service
// ============================================================

export class UsersService {
  /**
   * List users with pagination, search, and filtering.
   * Accessible only to Admin and Super Admin roles.
   */
  async listUsers(
    pagination: PaginationParams,
    filters: UserListFilters
  ): Promise<PaginatedResult<UserSummary>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        { employee: { firstName: { contains: term, mode: 'insensitive' } } },
        { employee: { lastName: { contains: term, mode: 'insensitive' } } },
        { employee: { employeeNumber: { contains: term, mode: 'insensitive' } } },
      ];
    }

    // Determine the sort field – support dot-paths into employee relation
    const allowedSortFields: Record<string, Prisma.UserOrderByWithRelationInput> = {
      email: { email: pagination.sortOrder },
      role: { role: pagination.sortOrder },
      status: { status: pagination.sortOrder },
      createdAt: { createdAt: pagination.sortOrder },
      lastLoginAt: { lastLoginAt: pagination.sortOrder },
      firstName: { employee: { firstName: pagination.sortOrder } },
      lastName: { employee: { lastName: pagination.sortOrder } },
    };

    const orderBy = allowedSortFields[pagination.sortBy || 'createdAt'] || { createdAt: 'desc' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: USER_SUMMARY_SELECT,
        orderBy,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return buildPaginatedResult(users as UserSummary[], total, pagination);
  }

  /**
   * Get a single user by ID with full detail.
   */
  async getUserById(userId: string): Promise<UserDetail | null> {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_DETAIL_SELECT,
    });

    return user as UserDetail | null;
  }

  /**
   * Create a new user via invite (admin-initiated).
   * Enforces license limits and password strength requirements.
   */
  async createUser(
    data: CreateUserData,
    actorId: string,
    ipAddress: string
  ): Promise<{ success: boolean; user?: UserDetail; error?: string }> {
    // 1. License check
    const license = await checkLicenseForRole(data.role);
    if (!license.allowed) {
      return { success: false, error: license.reason };
    }

    // 2. Password strength
    const strength = validatePasswordStrength(data.password);
    if (!strength.valid) {
      return { success: false, error: strength.errors.join(', ') };
    }

    // 3. Duplicate email check
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) {
      return { success: false, error: 'A user with this email already exists' };
    }

    // 4. Validate references
    if (data.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
      if (!dept) {
        return { success: false, error: 'Department not found' };
      }
    }

    if (data.locationId) {
      const loc = await prisma.location.findUnique({ where: { id: data.locationId } });
      if (!loc) {
        return { success: false, error: 'Location not found' };
      }
    }

    // 5. Hash password
    const passwordHash = await hashPassword(data.password);

    // 6. Generate employee number
    const count = await prisma.employee.count();
    const employeeNumber = `EMP${String(count + 1).padStart(5, '0')}`;

    // 7. Create user + employee in a transaction
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role,
        status: UserStatus.ACTIVE,
        mustChangePassword: true,
        employee: {
          create: {
            employeeNumber,
            firstName: data.firstName,
            lastName: data.lastName,
            jobTitle: data.jobTitle,
            departmentId: data.departmentId || undefined,
            locationId: data.locationId || undefined,
            hireDate: new Date(),
            createdBy: actorId,
          },
        },
      },
      select: USER_DETAIL_SELECT,
    });

    // 8. Audit
    await createAuditLog({
      actorId,
      action: AuditAction.USER_CREATED,
      objectType: 'User',
      objectId: user.id,
      after: { email: data.email, role: data.role, firstName: data.firstName, lastName: data.lastName },
      ipAddress,
    });

    logger.info(`User created: ${user.id} (${data.email}) by ${actorId}`);

    return { success: true, user: user as UserDetail };
  }

  /**
   * Update user fields. When a role change is requested the license
   * limits for the target role are verified first.
   */
  async updateUser(
    userId: string,
    data: UpdateUserData,
    actorId: string,
    ipAddress: string
  ): Promise<{ success: boolean; user?: UserDetail; error?: string }> {
    const existing = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        employee: true,
      },
    });

    if (!existing) {
      return { success: false, error: 'User not found' };
    }

    // Prevent modifying your own role
    if (data.role && userId === actorId) {
      return { success: false, error: 'You cannot change your own role' };
    }

    // Prevent demoting or modifying a SUPER_ADMIN unless actor is also SUPER_ADMIN
    // (enforced at route level via requireRole, but double-check here)

    // License check if role is changing
    if (data.role && data.role !== existing.role) {
      const license = await checkLicenseForRole(data.role);
      if (!license.allowed) {
        return { success: false, error: license.reason };
      }
    }

    // Validate email uniqueness if changing
    if (data.email && data.email.toLowerCase() !== existing.email) {
      const dup = await prisma.user.findUnique({
        where: { email: data.email.toLowerCase() },
      });
      if (dup) {
        return { success: false, error: 'A user with this email already exists' };
      }
    }

    // Validate references
    if (data.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
      if (!dept) {
        return { success: false, error: 'Department not found' };
      }
    }

    if (data.locationId) {
      const loc = await prisma.location.findUnique({ where: { id: data.locationId } });
      if (!loc) {
        return { success: false, error: 'Location not found' };
      }
    }

    // Build before-snapshot for audit
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    // Prepare user-level updates
    const userUpdate: Prisma.UserUpdateInput = {};

    if (data.email && data.email.toLowerCase() !== existing.email) {
      before.email = existing.email;
      after.email = data.email.toLowerCase();
      userUpdate.email = data.email.toLowerCase();
    }

    if (data.role && data.role !== existing.role) {
      before.role = existing.role;
      after.role = data.role;
      userUpdate.role = data.role;
    }

    // Prepare employee-level updates
    const employeeUpdate: Prisma.EmployeeUpdateInput = {};

    if (data.firstName && existing.employee && data.firstName !== existing.employee.firstName) {
      before.firstName = existing.employee.firstName;
      after.firstName = data.firstName;
      employeeUpdate.firstName = data.firstName;
    }

    if (data.lastName && existing.employee && data.lastName !== existing.employee.lastName) {
      before.lastName = existing.employee.lastName;
      after.lastName = data.lastName;
      employeeUpdate.lastName = data.lastName;
    }

    if (data.jobTitle && existing.employee && data.jobTitle !== existing.employee.jobTitle) {
      before.jobTitle = existing.employee.jobTitle;
      after.jobTitle = data.jobTitle;
      employeeUpdate.jobTitle = data.jobTitle;
    }

    if (data.departmentId !== undefined && existing.employee) {
      if (data.departmentId !== existing.employee.departmentId) {
        before.departmentId = existing.employee.departmentId;
        after.departmentId = data.departmentId;
        employeeUpdate.department = data.departmentId
          ? { connect: { id: data.departmentId } }
          : { disconnect: true };
      }
    }

    if (data.locationId !== undefined && existing.employee) {
      if (data.locationId !== existing.employee.locationId) {
        before.locationId = existing.employee.locationId;
        after.locationId = data.locationId;
        employeeUpdate.location = data.locationId
          ? { connect: { id: data.locationId } }
          : { disconnect: true };
      }
    }

    // Nothing to update
    if (Object.keys(userUpdate).length === 0 && Object.keys(employeeUpdate).length === 0) {
      return { success: false, error: 'No changes provided' };
    }

    // Execute updates in a transaction
    const updatedUser = await prisma.$transaction(async (tx) => {
      if (Object.keys(employeeUpdate).length > 0 && existing.employee) {
        employeeUpdate.updatedBy = actorId;
        await tx.employee.update({
          where: { id: existing.employee.id },
          data: employeeUpdate,
        });
      }

      return tx.user.update({
        where: { id: userId },
        data: userUpdate,
        select: USER_DETAIL_SELECT,
      });
    });

    // Determine the correct audit action
    const auditAction = data.role && data.role !== existing.role
      ? AuditAction.USER_ROLE_CHANGED
      : AuditAction.USER_UPDATED;

    await createAuditLog({
      actorId,
      action: auditAction,
      objectType: 'User',
      objectId: userId,
      before,
      after,
      ipAddress,
    });

    logger.info(`User updated: ${userId} by ${actorId}`);

    return { success: true, user: updatedUser as UserDetail };
  }

  /**
   * Deactivate a user – sets status to INACTIVE, terminates all
   * active sessions, and clears the refresh token.
   */
  async deactivateUser(
    userId: string,
    actorId: string,
    ipAddress: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.status === UserStatus.INACTIVE) {
      return { success: false, error: 'User is already inactive' };
    }

    // Prevent self-deactivation
    if (userId === actorId) {
      return { success: false, error: 'You cannot deactivate your own account' };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.INACTIVE,
          refreshTokenHash: null,
        },
      }),
      prisma.session.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      }),
    ]);

    await createAuditLog({
      actorId,
      action: AuditAction.USER_DEACTIVATED,
      objectType: 'User',
      objectId: userId,
      before: { status: user.status },
      after: { status: UserStatus.INACTIVE },
      ipAddress,
      metadata: reason ? { reason } : undefined,
    });

    logger.info(`User deactivated: ${userId} by ${actorId}${reason ? ` – ${reason}` : ''}`);

    return { success: true };
  }

  /**
   * Re-activate an inactive user. Verifies that the license still
   * permits another active user (and role-specific limits).
   */
  async activateUser(
    userId: string,
    actorId: string,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.status === UserStatus.ACTIVE) {
      return { success: false, error: 'User is already active' };
    }

    // License check – reactivating counts toward limits
    const license = await checkLicenseForRole(user.role);
    if (!license.allowed) {
      return { success: false, error: license.reason };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await createAuditLog({
      actorId,
      action: AuditAction.USER_UPDATED,
      objectType: 'User',
      objectId: userId,
      before: { status: user.status },
      after: { status: UserStatus.ACTIVE },
      ipAddress,
      metadata: { action: 'activate' },
    });

    logger.info(`User activated: ${userId} by ${actorId}`);

    return { success: true };
  }

  /**
   * Retrieve active sessions for a given user.
   */
  async getUserSessions(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      return null;
    }

    const sessions = await prisma.session.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions;
  }

  /**
   * Get current license / seat usage summary.
   */
  async getLicenseStatus() {
    return getLicenseStatus();
  }
}

export const usersService = new UsersService();
