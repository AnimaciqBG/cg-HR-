import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import prisma from '../../config/database';
import { UserRole, UserStatus } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    employeeId?: string;
  };
}

export function authGuard(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
      role: UserRole;
    };

    prisma.user
      .findUnique({
        where: { id: decoded.userId },
        include: { employee: { select: { id: true } } },
      })
      .then((user) => {
        if (!user || user.status !== UserStatus.ACTIVE) {
          res.status(401).json({ error: 'Account is not active' });
          return;
        }

        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          employeeId: user.employee?.id,
        };

        next();
      })
      .catch(() => {
        res.status(500).json({ error: 'Internal server error' });
      });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
