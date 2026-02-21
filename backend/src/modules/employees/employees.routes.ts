import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../common/guards/auth.guard';
import { authGuard } from '../../common/guards/auth.guard';
import {
  requirePermission,
  requireAnyPermission,
  hasPermission,
} from '../../common/guards/rbac.guard';
import { parsePagination } from '../../common/utils/pagination';
import { getClientIp, getUserAgent, createAuditLog } from '../../common/utils/audit';
import { employeesService } from './employees.service';
import { EmploymentStatus, ContractType, AuditAction } from '@prisma/client';

const router = Router();

// ---------------------------------------------------------------------------
// All employee routes require authentication
// ---------------------------------------------------------------------------
router.use(authGuard);

// ---------------------------------------------------------------------------
// GET /api/employees/org-chart
// Accessible to anyone authenticated (the tree itself contains no sensitive
// data). More privileged users already see the full org via list endpoint.
// ---------------------------------------------------------------------------
router.get('/org-chart', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orgChart = await employeesService.getOrgChart();
    res.json({ data: orgChart });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/employees
// Lists employees with pagination, filtering, and search.
// RBAC is enforced inside the service layer.
// ---------------------------------------------------------------------------
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const pagination = parsePagination(req.query as Record<string, unknown>);

    const filters: Record<string, unknown> = {};
    if (req.query.departmentId) filters.departmentId = req.query.departmentId as string;
    if (req.query.locationId) filters.locationId = req.query.locationId as string;
    if (req.query.managerId) filters.managerId = req.query.managerId as string;
    if (req.query.search) filters.search = req.query.search as string;

    if (
      req.query.employmentStatus &&
      Object.values(EmploymentStatus).includes(req.query.employmentStatus as EmploymentStatus)
    ) {
      filters.employmentStatus = req.query.employmentStatus as EmploymentStatus;
    }

    if (
      req.query.contractType &&
      Object.values(ContractType).includes(req.query.contractType as ContractType)
    ) {
      filters.contractType = req.query.contractType as ContractType;
    }

    const result = await employeesService.listEmployees({
      pagination,
      filters: filters as {
        departmentId?: string;
        locationId?: string;
        employmentStatus?: EmploymentStatus;
        contractType?: ContractType;
        managerId?: string;
        search?: string;
      },
      actor: {
        id: req.user.id,
        role: req.user.role,
        employeeId: req.user.employeeId,
      },
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/employees/:id
// Returns a single employee. RBAC is enforced in the service layer:
//   - employees see only their own record
//   - team leads see their subordinates
//   - HR / Admin see all
// ---------------------------------------------------------------------------
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const employee = await employeesService.getEmployeeById(req.params.id, {
      id: req.user.id,
      role: req.user.role,
      employeeId: req.user.employeeId,
    });

    if (!employee) {
      res.status(404).json({ error: 'Employee not found or access denied' });
      return;
    }

    // Log salary views for audit trail
    if (
      hasPermission(req.user.role, 'salary:read') &&
      req.user.employeeId !== req.params.id
    ) {
      await createAuditLog({
        actorId: req.user.id,
        action: AuditAction.SALARY_VIEWED,
        objectType: 'Employee',
        objectId: req.params.id,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    }

    res.json({ data: employee });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/employees
// Create a new employee. Restricted to HR, Admin, Super-Admin.
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAnyPermission('employees:write', 'employees:write_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const {
        firstName,
        lastName,
        middleName,
        dateOfBirth,
        personalId,
        phone,
        personalEmail,
        address,
        emergencyContact,
        emergencyPhone,
        photoUrl,
        departmentId,
        locationId,
        jobTitle,
        managerId,
        contractType,
        employmentStatus,
        hireDate,
        probationEndDate,
        weeklyHours,
        salary,
        hourlyRate,
        currency,
        email,
        role,
      } = req.body;

      // Basic validation
      if (!firstName || !lastName || !jobTitle || !hireDate) {
        res.status(400).json({
          error: 'firstName, lastName, jobTitle, and hireDate are required',
        });
        return;
      }

      const result = await employeesService.createEmployee(
        {
          firstName,
          lastName,
          middleName,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          personalId,
          phone,
          personalEmail,
          address,
          emergencyContact,
          emergencyPhone,
          photoUrl,
          departmentId,
          locationId,
          jobTitle,
          managerId,
          contractType,
          employmentStatus,
          hireDate: new Date(hireDate),
          probationEndDate: probationEndDate ? new Date(probationEndDate) : undefined,
          weeklyHours,
          salary,
          hourlyRate,
          currency,
          email,
          role,
        },
        req.user.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json({ data: result.employee });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/employees/:id
// Update an employee. RBAC enforced in the service layer:
//   - employees can update limited personal fields on their own record
//   - team leads can update subordinates (limited)
//   - HR / Admin can update all fields on any record
// ---------------------------------------------------------------------------
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const {
      firstName,
      lastName,
      middleName,
      dateOfBirth,
      personalId,
      phone,
      personalEmail,
      address,
      emergencyContact,
      emergencyPhone,
      photoUrl,
      departmentId,
      locationId,
      jobTitle,
      managerId,
      contractType,
      employmentStatus,
      hireDate,
      probationEndDate,
      terminationDate,
      weeklyHours,
      salary,
      hourlyRate,
      currency,
    } = req.body;

    // Build a sparse update object – only include fields that were sent
    const data: Record<string, unknown> = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (middleName !== undefined) data.middleName = middleName;
    if (dateOfBirth !== undefined)
      data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (personalId !== undefined) data.personalId = personalId;
    if (phone !== undefined) data.phone = phone;
    if (personalEmail !== undefined) data.personalEmail = personalEmail;
    if (address !== undefined) data.address = address;
    if (emergencyContact !== undefined) data.emergencyContact = emergencyContact;
    if (emergencyPhone !== undefined) data.emergencyPhone = emergencyPhone;
    if (photoUrl !== undefined) data.photoUrl = photoUrl;
    if (departmentId !== undefined) data.departmentId = departmentId;
    if (locationId !== undefined) data.locationId = locationId;
    if (jobTitle !== undefined) data.jobTitle = jobTitle;
    if (managerId !== undefined) data.managerId = managerId;
    if (contractType !== undefined) data.contractType = contractType;
    if (employmentStatus !== undefined) data.employmentStatus = employmentStatus;
    if (hireDate !== undefined) data.hireDate = new Date(hireDate);
    if (probationEndDate !== undefined)
      data.probationEndDate = probationEndDate ? new Date(probationEndDate) : null;
    if (terminationDate !== undefined)
      data.terminationDate = terminationDate ? new Date(terminationDate) : null;
    if (weeklyHours !== undefined) data.weeklyHours = weeklyHours;
    if (salary !== undefined) data.salary = salary;
    if (hourlyRate !== undefined) data.hourlyRate = hourlyRate;
    if (currency !== undefined) data.currency = currency;

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const result = await employeesService.updateEmployee(
      req.params.id,
      data as Parameters<typeof employeesService.updateEmployee>[1],
      {
        id: req.user.id,
        role: req.user.role,
        employeeId: req.user.employeeId,
      },
      getClientIp(req),
      getUserAgent(req)
    );

    if (!result.success) {
      const status = result.error === 'Insufficient permissions' ? 403
        : result.error === 'Employee not found' ? 404
        : 400;
      res.status(status).json({ error: result.error });
      return;
    }

    res.json({ data: result.employee });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/employees/:id
// Soft-delete an employee and suspend their user account.
// Restricted to ADMIN and SUPER_ADMIN.
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  requirePermission('employees:delete'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await employeesService.softDeleteEmployee(
        req.params.id,
        req.user.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(404).json({ error: result.error });
        return;
      }

      res.json({ message: 'Employee deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/employees/:id/timeline
// Returns the audit history for a given employee.
// RBAC enforced in the service layer.
// ---------------------------------------------------------------------------
router.get('/:id/timeline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));

    const result = await employeesService.getEmployeeTimeline(
      req.params.id,
      {
        id: req.user.id,
        role: req.user.role,
        employeeId: req.user.employeeId,
      },
      page,
      limit
    );

    if (!result) {
      res.status(404).json({ error: 'Employee not found or access denied' });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
