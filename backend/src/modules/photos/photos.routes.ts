import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuditAction } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { requireAnyPermission } from '../../common/guards/rbac.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';

const router = Router();

// Ensure uploads/photos directory exists
const photosDir = path.resolve(process.cwd(), 'uploads', 'photos');
if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir, { recursive: true });
}

// Multer config for photo uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, photosDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `photo-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

// All routes require authentication
router.use(authGuard);

// ---------------------------------------------------------------------------
// POST /api/photos/upload/:employeeId
// Upload a profile photo (self or admin). Goes to PENDING status.
// ---------------------------------------------------------------------------
router.post('/upload/:employeeId', upload.single('photo'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Photo file is required' });
      return;
    }

    const { employeeId } = req.params;

    // Verify employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });

    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Check permission: self-upload or admin
    const isSelf = employee.userId === req.user!.id;
    if (!isSelf) {
      // Need employees:write_all to upload for someone else
      const { resolveEffectivePermissions } = await import('../../common/guards/rbac.guard');
      const perms = await resolveEffectivePermissions(req.user!.id, req.user!.role);
      if (!perms.includes('employees:write_all')) {
        res.status(403).json({ error: 'Cannot upload photo for other employees' });
        return;
      }
    }

    const fileUrl = `/uploads/photos/${req.file.filename}`;

    const photo = await prisma.profilePhoto.create({
      data: {
        employeeId,
        fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        status: 'PENDING',
        isActive: false,
        uploadedBy: req.user!.id,
      },
    });

    await createAuditLog({
      actorId: req.user!.id,
      action: AuditAction.PHOTO_UPLOADED,
      objectType: 'ProfilePhoto',
      objectId: photo.id,
      after: { employeeId, fileName: req.file.originalname, status: 'PENDING' } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    res.status(201).json({ data: photo });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/photos/pending
// List all photos pending review. For managers/admins.
// ---------------------------------------------------------------------------
router.get('/pending', requireAnyPermission('employees:write', 'employees:write_all'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const photos = await prisma.profilePhoto.findMany({
      where: { status: 'PENDING' },
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true, jobTitle: true, photoUrl: true,
            user: { select: { id: true, email: true, role: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ data: photos });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/photos/:photoId/approve
// Approve a pending photo. Sets it as active, updates employee.photoUrl.
// ---------------------------------------------------------------------------
router.post('/:photoId/approve', requireAnyPermission('employees:write', 'employees:write_all'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { photoId } = req.params;

    const photo = await prisma.profilePhoto.findUnique({
      where: { id: photoId },
      include: { employee: { select: { id: true } } },
    });

    if (!photo) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    if (photo.status !== 'PENDING') {
      res.status(400).json({ error: 'Photo is not pending review' });
      return;
    }

    // Transaction: deactivate old photos, activate this one, update employee.photoUrl
    await prisma.$transaction(async (tx) => {
      // Deactivate all other active photos for this employee
      await tx.profilePhoto.updateMany({
        where: { employeeId: photo.employeeId, isActive: true },
        data: { isActive: false },
      });

      // Approve and activate this photo
      await tx.profilePhoto.update({
        where: { id: photoId },
        data: {
          status: 'APPROVED',
          isActive: true,
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        },
      });

      // Update employee photoUrl
      await tx.employee.update({
        where: { id: photo.employeeId },
        data: { photoUrl: photo.fileUrl },
      });
    });

    await createAuditLog({
      actorId: req.user!.id,
      action: AuditAction.PHOTO_APPROVED,
      objectType: 'ProfilePhoto',
      objectId: photoId,
      after: { employeeId: photo.employeeId, fileUrl: photo.fileUrl } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    res.json({ message: 'Photo approved and set as active' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/photos/:photoId/reject
// Reject a pending photo with a comment.
// ---------------------------------------------------------------------------
router.post('/:photoId/reject', requireAnyPermission('employees:write', 'employees:write_all'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { photoId } = req.params;
    const { comment } = req.body;

    const photo = await prisma.profilePhoto.findUnique({ where: { id: photoId } });

    if (!photo) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    if (photo.status !== 'PENDING') {
      res.status(400).json({ error: 'Photo is not pending review' });
      return;
    }

    await prisma.profilePhoto.update({
      where: { id: photoId },
      data: {
        status: 'REJECTED',
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
        reviewComment: comment || null,
      },
    });

    await createAuditLog({
      actorId: req.user!.id,
      action: AuditAction.PHOTO_REJECTED,
      objectType: 'ProfilePhoto',
      objectId: photoId,
      after: { employeeId: photo.employeeId, comment: comment || null } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    res.json({ message: 'Photo rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/photos/history/:employeeId
// Get photo history for an employee.
// ---------------------------------------------------------------------------
router.get('/history/:employeeId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId } = req.params;

    // Check access: self or admin
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true },
    });

    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const isSelf = employee.userId === req.user!.id;
    if (!isSelf) {
      const { resolveEffectivePermissions } = await import('../../common/guards/rbac.guard');
      const perms = await resolveEffectivePermissions(req.user!.id, req.user!.role);
      if (!perms.includes('employees:read_all') && !perms.includes('employees:read_team')) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const photos = await prisma.profilePhoto.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with reviewer info
    const reviewerIds = photos.map(p => p.reviewedBy).filter(Boolean) as string[];
    const uploaderIds = photos.map(p => p.uploadedBy);
    const allUserIds = [...new Set([...reviewerIds, ...uploaderIds])];

    const users = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
    });

    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const enriched = photos.map(p => ({
      ...p,
      uploadedByUser: userMap[p.uploadedBy] || null,
      reviewedByUser: p.reviewedBy ? userMap[p.reviewedBy] || null : null,
    }));

    res.json({ data: enriched });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
