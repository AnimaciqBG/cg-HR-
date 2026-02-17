import { Router, Response } from 'express';
import { UserRole, UserStatus } from '@prisma/client';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission, requireRole } from '../../common/guards/rbac.guard';
import { getClientIp, getUserAgent } from '../../common/utils/audit';
import { parsePagination } from '../../common/utils/pagination';
import { usersService } from './users.service';

const router = Router();

// All routes require authentication + users:read or users:write
// ============================================================

// GET /api/users – list all users (admin only)
router.get(
  '/',
  authGuard,
  requirePermission('users:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pagination = parsePagination(req.query as Record<string, unknown>);

      const filters: {
        search?: string;
        role?: UserRole;
        status?: UserStatus;
      } = {};

      if (req.query.search && typeof req.query.search === 'string') {
        filters.search = req.query.search;
      }

      if (req.query.role && typeof req.query.role === 'string') {
        const role = req.query.role.toUpperCase() as UserRole;
        if (Object.values(UserRole).includes(role)) {
          filters.role = role;
        }
      }

      if (req.query.status && typeof req.query.status === 'string') {
        const status = req.query.status.toUpperCase() as UserStatus;
        if (Object.values(UserStatus).includes(status)) {
          filters.status = status;
        }
      }

      const result = await usersService.listUsers(pagination, filters);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/users/:id – get user by ID
router.get(
  '/:id',
  authGuard,
  requirePermission('users:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await usersService.getUserById(req.params.id);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/users – create / invite a new user
router.post(
  '/',
  authGuard,
  requirePermission('users:write'),
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, password, role, firstName, lastName, jobTitle, departmentId, locationId } =
        req.body;

      // Basic validation
      if (!email || !password || !role || !firstName || !lastName || !jobTitle) {
        res.status(400).json({
          error: 'Missing required fields: email, password, role, firstName, lastName, jobTitle',
        });
        return;
      }

      // Validate role enum
      const upperRole = (role as string).toUpperCase() as UserRole;
      if (!Object.values(UserRole).includes(upperRole)) {
        res.status(400).json({ error: `Invalid role. Must be one of: ${Object.values(UserRole).join(', ')}` });
        return;
      }

      // Only SUPER_ADMIN can create another SUPER_ADMIN
      if (upperRole === UserRole.SUPER_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Only a Super Admin can create another Super Admin' });
        return;
      }

      const result = await usersService.createUser(
        {
          email,
          password,
          role: upperRole,
          firstName,
          lastName,
          jobTitle,
          departmentId,
          locationId,
        },
        req.user!.id,
        getClientIp(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json(result.user);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/users/:id – update user (profile, role, etc.)
router.put(
  '/:id',
  authGuard,
  requirePermission('users:write'),
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, role, firstName, lastName, jobTitle, departmentId, locationId } = req.body;

      // Validate role if provided
      let validatedRole: UserRole | undefined;
      if (role) {
        const upperRole = (role as string).toUpperCase() as UserRole;
        if (!Object.values(UserRole).includes(upperRole)) {
          res.status(400).json({ error: `Invalid role. Must be one of: ${Object.values(UserRole).join(', ')}` });
          return;
        }

        // Only SUPER_ADMIN can assign/modify SUPER_ADMIN role
        if (upperRole === UserRole.SUPER_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
          res.status(403).json({ error: 'Only a Super Admin can assign the Super Admin role' });
          return;
        }

        validatedRole = upperRole;
      }

      const result = await usersService.updateUser(
        req.params.id,
        {
          email,
          role: validatedRole,
          firstName,
          lastName,
          jobTitle,
          departmentId,
          locationId,
        },
        req.user!.id,
        getClientIp(req)
      );

      if (!result.success) {
        // Use 404 when the user doesn't exist
        const status = result.error === 'User not found' ? 404 : 400;
        res.status(status).json({ error: result.error });
        return;
      }

      res.json(result.user);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/users/:id/deactivate – deactivate a user
router.post(
  '/:id/deactivate',
  authGuard,
  requirePermission('users:write'),
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { reason } = req.body || {};

      const result = await usersService.deactivateUser(
        req.params.id,
        req.user!.id,
        getClientIp(req),
        reason
      );

      if (!result.success) {
        const status = result.error === 'User not found' ? 404 : 400;
        res.status(status).json({ error: result.error });
        return;
      }

      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/users/:id/activate – reactivate a user
router.post(
  '/:id/activate',
  authGuard,
  requirePermission('users:write'),
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await usersService.activateUser(
        req.params.id,
        req.user!.id,
        getClientIp(req)
      );

      if (!result.success) {
        const status = result.error === 'User not found' ? 404 : 400;
        res.status(status).json({ error: result.error });
        return;
      }

      res.json({ message: 'User activated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/users/:id/sessions – list active sessions for a user
router.get(
  '/:id/sessions',
  authGuard,
  requirePermission('users:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessions = await usersService.getUserSessions(req.params.id);

      if (sessions === null) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ data: sessions });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
