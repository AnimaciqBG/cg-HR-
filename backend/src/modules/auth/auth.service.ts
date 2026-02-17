import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { UserRole, UserStatus, AuditAction } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config';
import { hashPassword, comparePassword, validatePasswordStrength } from '../../common/utils/password';
import { createAuditLog } from '../../common/utils/audit';
import { checkLicenseForRole } from '../../common/utils/license';
import { v4 as uuid } from 'uuid';
import logger from '../../config/logger';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface LoginResult {
  success: boolean;
  requiresTwoFactor?: boolean;
  tempToken?: string;
  tokens?: TokenPair;
  user?: {
    id: string;
    email: string;
    role: UserRole;
    employeeId?: string;
    mustChangePassword: boolean;
  };
  error?: string;
}

export class AuthService {
  async login(
    email: string,
    password: string,
    ipAddress: string,
    userAgent: string
  ): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!user) {
      await createAuditLog({
        action: AuditAction.LOGIN_FAILED,
        objectType: 'User',
        ipAddress,
        userAgent,
        metadata: { email, reason: 'User not found' },
      });
      return { success: false, error: 'Invalid email or password' };
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return {
        success: false,
        error: `Account locked. Try again in ${minutesLeft} minutes`,
      };
    }

    // Check status
    if (user.status !== UserStatus.ACTIVE) {
      return { success: false, error: 'Account is not active' };
    }

    // Verify password
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const updateData: Record<string, unknown> = { failedLoginAttempts: attempts };

      if (attempts >= config.security.loginMaxAttempts) {
        updateData.lockedUntil = new Date(
          Date.now() + config.security.loginLockoutMinutes * 60 * 1000
        );
        updateData.failedLoginAttempts = 0;
      }

      await prisma.user.update({ where: { id: user.id }, data: updateData });

      await createAuditLog({
        actorId: user.id,
        action: AuditAction.LOGIN_FAILED,
        objectType: 'User',
        objectId: user.id,
        ipAddress,
        userAgent,
        metadata: { attempts },
      });

      return { success: false, error: 'Invalid email or password' };
    }

    // Check 2FA
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { userId: user.id, purpose: '2fa' },
        config.jwt.secret,
        { expiresIn: '5m' }
      );
      return { success: true, requiresTwoFactor: true, tempToken };
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Update login info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        failedLoginAttempts: 0,
        lockedUntil: null,
        refreshTokenHash: await hashPassword(tokens.refreshToken),
      },
    });

    // Create session
    await prisma.session.create({
      data: {
        userId: user.id,
        token: tokens.accessToken.slice(-32),
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await createAuditLog({
      actorId: user.id,
      action: AuditAction.LOGIN,
      objectType: 'User',
      objectId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employee?.id,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async verify2FA(
    tempToken: string,
    totpCode: string,
    ipAddress: string,
    userAgent: string
  ): Promise<LoginResult> {
    try {
      const decoded = jwt.verify(tempToken, config.jwt.secret) as {
        userId: string;
        purpose: string;
      };

      if (decoded.purpose !== '2fa') {
        return { success: false, error: 'Invalid token' };
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { employee: { select: { id: true } } },
      });

      if (!user || !user.twoFactorSecret) {
        return { success: false, error: 'Invalid request' };
      }

      const isValid = authenticator.verify({
        token: totpCode,
        secret: user.twoFactorSecret,
      });

      if (!isValid) {
        // Check recovery codes
        const codeIndex = user.recoveryCodes.indexOf(totpCode);
        if (codeIndex === -1) {
          return { success: false, error: 'Invalid 2FA code' };
        }
        // Remove used recovery code
        const codes = [...user.recoveryCodes];
        codes.splice(codeIndex, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { recoveryCodes: codes },
        });
      }

      const tokens = await this.generateTokens(user.id, user.email, user.role);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
          failedLoginAttempts: 0,
          lockedUntil: null,
          refreshTokenHash: await hashPassword(tokens.refreshToken),
        },
      });

      await createAuditLog({
        actorId: user.id,
        action: AuditAction.LOGIN,
        objectType: 'User',
        objectId: user.id,
        ipAddress,
        userAgent,
        metadata: { with2FA: true },
      });

      return {
        success: true,
        tokens,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          employeeId: user.employee?.id,
          mustChangePassword: user.mustChangePassword,
        },
      };
    } catch {
      return { success: false, error: 'Invalid or expired token' };
    }
  }

  async setup2FA(userId: string): Promise<{ secret: string; qrCode: string; recoveryCodes: string[] }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'HR Platform', secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    const recoveryCodes = Array.from({ length: 8 }, () => uuid().slice(0, 8));

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, recoveryCodes },
    });

    return { secret, qrCode, recoveryCodes };
  }

  async confirm2FA(userId: string, totpCode: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) return false;

    const isValid = authenticator.verify({
      token: totpCode,
      secret: user.twoFactorSecret,
    });

    if (isValid) {
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      });
      await createAuditLog({
        actorId: userId,
        action: AuditAction.TWO_FA_ENABLED,
        objectType: 'User',
        objectId: userId,
      });
    }

    return isValid;
  }

  async disable2FA(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        recoveryCodes: [],
      },
    });
    await createAuditLog({
      actorId: userId,
      action: AuditAction.TWO_FA_DISABLED,
      objectType: 'User',
      objectId: userId,
    });
  }

  async refreshToken(refreshTokenValue: string): Promise<TokenPair | null> {
    try {
      const decoded = jwt.verify(refreshTokenValue, config.jwt.refreshSecret) as {
        userId: string;
        email: string;
        role: UserRole;
      };

      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user || user.status !== UserStatus.ACTIVE || !user.refreshTokenHash) {
        return null;
      }

      const valid = await comparePassword(refreshTokenValue, user.refreshTokenHash);
      if (!valid) return null;

      const tokens = await this.generateTokens(user.id, user.email, user.role);

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: await hashPassword(tokens.refreshToken) },
      });

      return tokens;
    } catch {
      return null;
    }
  }

  async logout(userId: string, ipAddress: string, userAgent: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    await prisma.session.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    await createAuditLog({
      actorId: userId,
      action: AuditAction.LOGOUT,
      objectType: 'User',
      objectId: userId,
      ipAddress,
      userAgent,
    });
  }

  async logoutAllDevices(userId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { userId },
      data: { isActive: false },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress: string
  ): Promise<{ success: boolean; errors?: string[] }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, errors: ['User not found'] };

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) return { success: false, errors: ['Current password is incorrect'] };

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) return { success: false, errors: strength.errors };

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
      },
    });

    await createAuditLog({
      actorId: userId,
      action: AuditAction.PASSWORD_CHANGED,
      objectType: 'User',
      objectId: userId,
      ipAddress,
    });

    return { success: true };
  }

  async createUserByInvite(
    data: {
      email: string;
      password: string;
      role: UserRole;
      firstName: string;
      lastName: string;
      jobTitle: string;
      departmentId?: string;
      locationId?: string;
    },
    creatorId: string,
    ipAddress: string
  ): Promise<{ success: boolean; userId?: string; error?: string }> {
    // Check license limits
    const license = await checkLicenseForRole(data.role);
    if (!license.allowed) {
      return { success: false, error: license.reason };
    }

    // Check password strength
    const strength = validatePasswordStrength(data.password);
    if (!strength.valid) {
      return { success: false, error: strength.errors.join(', ') };
    }

    // Check if email exists
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      return { success: false, error: 'Email already registered' };
    }

    const passwordHash = await hashPassword(data.password);

    // Generate employee number
    const count = await prisma.employee.count();
    const employeeNumber = `EMP${String(count + 1).padStart(5, '0')}`;

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
            departmentId: data.departmentId,
            locationId: data.locationId,
            hireDate: new Date(),
            createdBy: creatorId,
          },
        },
      },
    });

    await createAuditLog({
      actorId: creatorId,
      action: AuditAction.USER_CREATED,
      objectType: 'User',
      objectId: user.id,
      after: { email: data.email, role: data.role },
      ipAddress,
    });

    return { success: true, userId: user.id };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole
  ): Promise<TokenPair> {
    const accessToken = jwt.sign(
      { userId, email, role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiration as string }
    );

    const refreshToken = jwt.sign(
      { userId, email, role },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiration as string }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.expiration,
    };
  }
}

export const authService = new AuthService();
