import { Router, Response } from 'express';
import { AuditAction, UserRole } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission } from '../../common/guards/rbac.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';
import { parsePagination, buildPaginatedResult } from '../../common/utils/pagination';

const router = Router();

// GET /api/announcements
router.get('/', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const now = new Date();

    const where: Record<string, unknown> = {
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where: where as any,
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * limit, take: limit,
        include: {
          readReceipts: {
            where: { userId: req.user!.id },
            select: { readAt: true },
          },
        },
      }),
      prisma.announcement.count({ where: where as any }),
    ]);

    const result = announcements.map((a) => ({
      ...a,
      isRead: a.readReceipts.length > 0,
      readAt: a.readReceipts[0]?.readAt || null,
      readReceipts: undefined,
    }));

    res.json(buildPaginatedResult(result, total, { page, limit }));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/announcements
router.post('/', authGuard, requirePermission('announcements:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, content, priority, isPinned, targetDepartments, targetRoles, expiresAt, attachmentUrl } = req.body;
    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required' }); return;
    }

    const announcement = await prisma.announcement.create({
      data: {
        title, content, priority: priority || 'normal',
        isPinned: isPinned || false,
        targetDepartments: targetDepartments || [],
        targetRoles: targetRoles || [],
        publishedAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        attachmentUrl, createdBy: req.user!.id,
      },
    });

    await createAuditLog({
      actorId: req.user!.id, action: AuditAction.ANNOUNCEMENT_CREATED,
      objectType: 'Announcement', objectId: announcement.id,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    res.status(201).json(announcement);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/announcements/:id
router.put('/:id', authGuard, requirePermission('announcements:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, content, priority, isPinned, expiresAt } = req.body;
    const data: Record<string, unknown> = {};
    if (title) data.title = title;
    if (content) data.content = content;
    if (priority) data.priority = priority;
    if (isPinned !== undefined) data.isPinned = isPinned;
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const updated = await prisma.announcement.update({ where: { id: req.params.id }, data: data as any });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/announcements/:id/read
router.post('/:id/read', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId: req.params.id, userId: req.user!.id } },
      create: { announcementId: req.params.id, userId: req.user!.id },
      update: { readAt: new Date() },
    });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/announcements/:id
router.delete('/:id', authGuard, requirePermission('announcements:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.announcement.delete({ where: { id: req.params.id } });
    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
