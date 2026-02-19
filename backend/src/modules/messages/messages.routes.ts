import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requirePermission } from '../../common/guards/rbac.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';
import { createNotification } from '../notifications/notifications.routes';
import { AuditAction, NotificationType } from '@prisma/client';

const router = Router();
router.use(authGuard);

// ---------------------------------------------------------------------------
// Multer for message attachments
// ---------------------------------------------------------------------------
const attachDir = path.resolve(process.cwd(), 'uploads', 'attachments');
if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, attachDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|zip/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext || mime);
  },
});

// ---------------------------------------------------------------------------
// GET /api/messages/conversations — list my conversations
// ---------------------------------------------------------------------------
router.get(
  '/conversations',
  requirePermission('messages:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const participations = await prisma.conversationParticipant.findMany({
        where: { userId },
        include: {
          conversation: {
            include: {
              participants: {
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      employee: {
                        select: { id: true, firstName: true, lastName: true, photoUrl: true, jobTitle: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { conversation: { lastMessageAt: { sort: 'desc', nulls: 'last' } } },
      });

      const conversations = participations.map((p) => {
        const conv = p.conversation;
        const otherParticipants = conv.participants.filter((pp) => pp.userId !== userId);
        const unread = p.lastReadAt
          ? conv.lastMessageAt && conv.lastMessageAt > p.lastReadAt
          : !!conv.lastMessageAt;

        return {
          id: conv.id,
          title: conv.title,
          isGroup: conv.isGroup,
          lastMessageAt: conv.lastMessageAt,
          lastMessageText: conv.lastMessageText,
          unread,
          isMuted: p.isMuted,
          participants: conv.participants.map((pp) => ({
            userId: pp.userId,
            firstName: pp.user.employee?.firstName || pp.user.email,
            lastName: pp.user.employee?.lastName || '',
            photoUrl: pp.user.employee?.photoUrl,
            jobTitle: pp.user.employee?.jobTitle,
          })),
          otherParticipants: otherParticipants.map((pp) => ({
            userId: pp.userId,
            firstName: pp.user.employee?.firstName || pp.user.email,
            lastName: pp.user.employee?.lastName || '',
            photoUrl: pp.user.employee?.photoUrl,
            jobTitle: pp.user.employee?.jobTitle,
          })),
        };
      });

      res.json({ data: conversations });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/messages/conversations — create / find a conversation
// ---------------------------------------------------------------------------
router.post(
  '/conversations',
  requirePermission('messages:send'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { participantIds, title } = req.body as { participantIds: string[]; title?: string };

      if (!participantIds || participantIds.length === 0) {
        res.status(400).json({ error: 'participantIds required' });
        return;
      }

      // Ensure the creator is always a participant
      const allIds = Array.from(new Set([userId, ...participantIds]));
      const isGroup = allIds.length > 2;

      // For 1-on-1, check if conversation already exists
      if (!isGroup) {
        const otherId = allIds.find((id) => id !== userId)!;
        const existing = await prisma.conversation.findFirst({
          where: {
            isGroup: false,
            participants: { every: { userId: { in: [userId, otherId] } } },
            AND: [
              { participants: { some: { userId } } },
              { participants: { some: { userId: otherId } } },
            ],
          },
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    employee: {
                      select: { id: true, firstName: true, lastName: true, photoUrl: true, jobTitle: true },
                    },
                  },
                },
              },
            },
          },
        });

        if (existing) {
          // Check participant count to ensure it's truly a 1-on-1
          if (existing.participants.length === 2) {
            res.json({ data: { id: existing.id, isGroup: false, existing: true } });
            return;
          }
        }
      }

      const conversation = await prisma.conversation.create({
        data: {
          title: isGroup ? title || 'Group Chat' : null,
          isGroup,
          createdById: userId,
          participants: {
            create: allIds.map((uid) => ({ userId: uid })),
          },
        },
      });

      await createAuditLog({
        actorId: userId,
        action: AuditAction.CONVERSATION_CREATED,
        objectType: 'Conversation',
        objectId: conversation.id,
        after: { participantCount: allIds.length, isGroup },
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      });

      res.status(201).json({ data: { id: conversation.id, isGroup, existing: false } });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/messages/conversations/:id/messages — get messages
// ---------------------------------------------------------------------------
router.get(
  '/conversations/:id/messages',
  requirePermission('messages:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const conversationId = req.params.id;
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
      const before = req.query.before as string | undefined;

      // Verify participation
      const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!participant) {
        res.status(403).json({ error: 'Not a participant' });
        return;
      }

      const where: any = { conversationId, deletedAt: null };
      if (before) where.createdAt = { lt: new Date(before) };

      const messages = await prisma.message.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true, photoUrl: true },
              },
            },
          },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      res.json({ data: messages.reverse() });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/messages/conversations/:id/messages — send a message
// ---------------------------------------------------------------------------
router.post(
  '/conversations/:id/messages',
  requirePermission('messages:send'),
  upload.array('attachments', 5),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const conversationId = req.params.id;
      const { content } = req.body;
      const files = (req.files as Express.Multer.File[]) || [];

      if (!content && files.length === 0) {
        res.status(400).json({ error: 'Message content or attachment required' });
        return;
      }

      // Verify participation
      const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!participant) {
        res.status(403).json({ error: 'Not a participant' });
        return;
      }

      const preview = content
        ? content.substring(0, 100)
        : `[${files.length} attachment${files.length > 1 ? 's' : ''}]`;

      const message = await prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            conversationId,
            senderId: userId,
            content: content || null,
            attachments: files.length > 0
              ? {
                  create: files.map((f) => ({
                    fileUrl: `/uploads/attachments/${f.filename}`,
                    fileName: f.originalname,
                    fileSize: f.size,
                    mimeType: f.mimetype,
                  })),
                }
              : undefined,
          },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                employee: {
                  select: { firstName: true, lastName: true, photoUrl: true },
                },
              },
            },
            attachments: true,
          },
        });

        // Update conversation metadata
        await tx.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: msg.createdAt, lastMessageText: preview },
        });

        // Mark as read for sender
        await tx.conversationParticipant.update({
          where: { conversationId_userId: { conversationId, userId } },
          data: { lastReadAt: msg.createdAt },
        });

        return msg;
      });

      // Notify other participants (non-blocking)
      const senderName = message.sender.employee
        ? `${message.sender.employee.firstName} ${message.sender.employee.lastName}`
        : message.sender.email;

      const allParticipants = await prisma.conversationParticipant.findMany({
        where: { conversationId, userId: { not: userId }, isMuted: false },
      });

      for (const p of allParticipants) {
        createNotification(
          p.userId,
          NotificationType.NEW_MESSAGE,
          `Message from ${senderName}`,
          preview,
          `/messages?c=${conversationId}`
        ).catch(() => {});
      }

      // Audit log for attachments
      if (files.length > 0) {
        createAuditLog({
          actorId: userId,
          action: AuditAction.MESSAGE_ATTACHMENT_UPLOADED,
          objectType: 'Message',
          objectId: message.id,
          after: {
            conversationId,
            fileCount: files.length,
            fileNames: files.map((f) => f.originalname),
          },
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        }).catch(() => {});
      }

      res.status(201).json({ data: message });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/messages/conversations/:id/read — mark conversation as read
// ---------------------------------------------------------------------------
router.post(
  '/conversations/:id/read',
  requirePermission('messages:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const conversationId = req.params.id;

      await prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: new Date() },
      });

      res.json({ message: 'Marked as read' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/messages/conversations/:id/seen — get seen status per participant
// ---------------------------------------------------------------------------
router.get(
  '/conversations/:id/seen',
  requirePermission('messages:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const conversationId = req.params.id;

      // Verify participation
      const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!participant) {
        res.status(403).json({ error: 'Not a participant' });
        return;
      }

      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        include: {
          user: {
            select: {
              id: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      const seen = participants.map((p) => ({
        userId: p.userId,
        name: p.user.employee
          ? `${p.user.employee.firstName} ${p.user.employee.lastName}`
          : p.userId,
        lastReadAt: p.lastReadAt,
      }));

      res.json({ data: seen });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/messages/conversations/:id/mute — toggle mute
// ---------------------------------------------------------------------------
router.patch(
  '/conversations/:id/mute',
  requirePermission('messages:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const conversationId = req.params.id;
      const { muted } = req.body as { muted: boolean };

      await prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { isMuted: !!muted },
      });

      res.json({ message: muted ? 'Muted' : 'Unmuted' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/messages/directory — employee directory for starting chats
// ---------------------------------------------------------------------------
router.get(
  '/directory',
  requirePermission('messages:send'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const search = (req.query.search as string) || '';

      const where: any = {
        deletedAt: null,
        id: { not: userId },
        status: 'ACTIVE',
      };

      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { employee: { firstName: { contains: search, mode: 'insensitive' } } },
          { employee: { lastName: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photoUrl: true,
              jobTitle: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { employee: { firstName: 'asc' } },
        take: 50,
      });

      res.json({ data: users.filter((u) => u.employee) });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/messages/unread-count — total unread conversations
// ---------------------------------------------------------------------------
router.get(
  '/unread-count',
  requirePermission('messages:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const participations = await prisma.conversationParticipant.findMany({
        where: { userId, isMuted: false },
        include: { conversation: { select: { lastMessageAt: true } } },
      });

      let count = 0;
      for (const p of participations) {
        if (p.conversation.lastMessageAt) {
          if (!p.lastReadAt || p.conversation.lastMessageAt > p.lastReadAt) {
            count++;
          }
        }
      }

      res.json({ unreadCount: count });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
