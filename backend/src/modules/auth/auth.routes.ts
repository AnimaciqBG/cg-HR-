import { Router, Request, Response } from 'express';
import { authService } from './auth.service';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { getClientIp, getUserAgent } from '../../common/utils/audit';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await authService.login(
      email,
      password,
      getClientIp(req),
      getUserAgent(req)
    );

    if (!result.success && !result.requiresTwoFactor) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/verify-2fa
router.post('/verify-2fa', async (req: Request, res: Response) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      res.status(400).json({ error: 'Token and code are required' });
      return;
    }

    const result = await authService.verify2FA(
      tempToken,
      code,
      getClientIp(req),
      getUserAgent(req)
    );

    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const tokens = await authService.refreshToken(refreshToken);
    if (!tokens) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await authService.logout(req.user!.id, getClientIp(req), getUserAgent(req));
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout-all
router.post('/logout-all', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await authService.logoutAllDevices(req.user!.id);
    res.json({ message: 'All sessions terminated' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Both passwords are required' });
      return;
    }

    const result = await authService.changePassword(
      req.user!.id,
      currentPassword,
      newPassword,
      getClientIp(req)
    );

    if (!result.success) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/2fa/setup
router.post('/2fa/setup', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await authService.setup2FA(req.user!.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/2fa/confirm
router.post('/2fa/confirm', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'TOTP code is required' });
      return;
    }

    const success = await authService.confirm2FA(req.user!.id, code);
    if (!success) {
      res.status(400).json({ error: 'Invalid code' });
      return;
    }

    res.json({ message: '2FA enabled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/2fa/disable
router.post('/2fa/disable', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await authService.disable2FA(req.user!.id);
    res.json({ message: '2FA disabled' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await (await import('../../config/database')).default.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        mustChangePassword: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            photoUrl: true,
            department: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
          },
        },
      },
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
