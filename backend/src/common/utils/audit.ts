import { AuditAction, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import logger from '../../config/logger';

interface AuditLogEntry {
  actorId?: string;
  action: AuditAction;
  objectType?: string;
  objectId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        objectType: entry.objectType,
        objectId: entry.objectId,
        before: (entry.before as Prisma.InputJsonValue) || undefined,
        after: (entry.after as Prisma.InputJsonValue) || undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        metadata: (entry.metadata as Prisma.InputJsonValue) || undefined,
      },
    });
  } catch (error) {
    logger.error('Failed to create audit log', { error, entry });
  }
}

export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || 'unknown';
}

export function getUserAgent(req: { headers: Record<string, string | string[] | undefined> }): string {
  return (req.headers['user-agent'] as string) || 'unknown';
}
