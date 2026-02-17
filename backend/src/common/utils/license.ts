import { UserRole, UserStatus } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config';

export interface LicenseStatus {
  activeUsers: number;
  maxUsers: number;
  activeAdmins: number;
  maxAdmins: number;
  activeSuperAdmins: number;
  maxSuperAdmins: number;
  canAddUser: boolean;
  canAddAdmin: boolean;
  canAddSuperAdmin: boolean;
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const [activeUsers, activeAdmins, activeSuperAdmins] = await Promise.all([
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.user.count({ where: { status: UserStatus.ACTIVE, role: UserRole.ADMIN } }),
    prisma.user.count({ where: { status: UserStatus.ACTIVE, role: UserRole.SUPER_ADMIN } }),
  ]);

  // Try to get dynamic limits from settings, fall back to config
  let maxUsers = config.limits.maxUsers;
  let maxAdmins = config.limits.maxAdmins;
  let maxSuperAdmins = config.limits.maxSuperAdmins;

  try {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: ['maxUsers', 'maxAdmins', 'maxSuperAdmins'] } },
    });
    for (const s of settings) {
      if (s.key === 'maxUsers') maxUsers = parseInt(s.value, 10);
      if (s.key === 'maxAdmins') maxAdmins = parseInt(s.value, 10);
      if (s.key === 'maxSuperAdmins') maxSuperAdmins = parseInt(s.value, 10);
    }
  } catch {
    // Use config defaults
  }

  return {
    activeUsers,
    maxUsers,
    activeAdmins,
    maxAdmins,
    activeSuperAdmins,
    maxSuperAdmins,
    canAddUser: activeUsers < maxUsers,
    canAddAdmin: activeAdmins < maxAdmins,
    canAddSuperAdmin: activeSuperAdmins < maxSuperAdmins,
  };
}

export async function checkLicenseForRole(role: UserRole): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getLicenseStatus();

  if (!status.canAddUser) {
    return { allowed: false, reason: `User limit reached (${status.activeUsers}/${status.maxUsers})` };
  }

  if (role === UserRole.ADMIN && !status.canAddAdmin) {
    return { allowed: false, reason: `Admin limit reached (${status.activeAdmins}/${status.maxAdmins})` };
  }

  if (role === UserRole.SUPER_ADMIN && !status.canAddSuperAdmin) {
    return {
      allowed: false,
      reason: `Super Admin limit reached (${status.activeSuperAdmins}/${status.maxSuperAdmins})`,
    };
  }

  return { allowed: true };
}
