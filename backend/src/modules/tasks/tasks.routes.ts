import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuditAction, NotificationType } from '@prisma/client';
import prisma from '../../config/database';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import { createAuditLog, getClientIp, getUserAgent } from '../../common/utils/audit';
import { createNotification } from '../notifications/notifications.routes';

const router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'WAITING_FOR_REVIEW', 'APPROVED', 'REJECTED'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const MIN_PROOFS_FOR_COMPLETE = 3;

// Allowed status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'WAITING_FOR_REVIEW'],
  COMPLETED: ['WAITING_FOR_REVIEW'],
  WAITING_FOR_REVIEW: ['APPROVED', 'REJECTED'],
  REJECTED: ['IN_PROGRESS'],
  APPROVED: [],
};

// ---------------------------------------------------------------------------
// Multer for proof uploads
// ---------------------------------------------------------------------------
const proofsDir = path.resolve(process.cwd(), 'uploads', 'proofs');
if (!fs.existsSync(proofsDir)) {
  fs.mkdirSync(proofsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, proofsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `proof-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP and PDF files are allowed'));
    }
  },
});

router.use(authGuard);

// ---------------------------------------------------------------------------
// Helper: get actor's employeeId
// ---------------------------------------------------------------------------
async function getEmployeeId(userId: string): Promise<string | null> {
  const emp = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
  return emp?.id || null;
}

// Helper: check if user can manage tasks (TL, HR, Admin, SuperAdmin)
function canManageTasks(role: string): boolean {
  return ['TEAM_LEAD', 'HR', 'ADMIN', 'PAYROLL_ADMIN', 'SUPER_ADMIN'].includes(role);
}

// ---------------------------------------------------------------------------
// POST /api/tasks
// Create a new task and assign it. Only managers/admins.
// ---------------------------------------------------------------------------
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !canManageTasks(req.user.role)) {
      res.status(403).json({ error: 'Only managers and admins can create tasks' });
      return;
    }

    const { title, description, priority, assigneeId, dueDate } = req.body;

    if (!title || !assigneeId) {
      res.status(400).json({ error: 'title and assigneeId are required' });
      return;
    }

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
      return;
    }

    // Verify assignee exists
    const assignee = await prisma.employee.findUnique({
      where: { id: assigneeId },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (!assignee) {
      res.status(404).json({ error: 'Assignee employee not found' });
      return;
    }

    const creatorEmployeeId = await getEmployeeId(req.user.id);
    if (!creatorEmployeeId) {
      res.status(400).json({ error: 'Creator must have an employee record' });
      return;
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
        dueDate: dueDate ? new Date(dueDate) : null,
        assigneeId,
        createdById: creatorEmployeeId,
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, userId: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        proofs: true,
      },
    });

    // Audit log
    await createAuditLog({
      actorId: req.user.id,
      action: AuditAction.TASK_CREATED,
      objectType: 'Task',
      objectId: task.id,
      after: { title, assigneeId, priority: task.priority } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    // Notification to assignee
    await createNotification(
      assignee.userId,
      NotificationType.TASK_ASSIGNED,
      'New Task Assigned',
      `You have been assigned a new task: "${title}"`,
      `/tasks`
    );

    res.status(201).json({ data: task });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/tasks
// List tasks. Employees see their own, managers see all/their team.
// ?status=OPEN&assigneeId=xxx&createdById=xxx&page=1&limit=20
// ---------------------------------------------------------------------------
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Filter by status
    if (req.query.status && VALID_STATUSES.includes(req.query.status as string)) {
      where.status = req.query.status;
    }

    // Filter by priority
    if (req.query.priority && VALID_PRIORITIES.includes(req.query.priority as string)) {
      where.priority = req.query.priority;
    }

    // RBAC: employees only see tasks assigned to them
    const employeeId = await getEmployeeId(req.user.id);
    if (!canManageTasks(req.user.role)) {
      if (!employeeId) {
        res.json({ data: [], meta: { total: 0, page, limit, totalPages: 0 } });
        return;
      }
      where.assigneeId = employeeId;
    } else {
      // Managers can filter by assignee or creator
      if (req.query.assigneeId) where.assigneeId = req.query.assigneeId;
      if (req.query.createdById) where.createdById = req.query.createdById;
    }

    // View mode for managers: "my-created" shows only tasks they created
    if (req.query.view === 'my-created' && employeeId) {
      where.createdById = employeeId;
    }
    // "review" shows tasks waiting for review
    if (req.query.view === 'review') {
      where.status = 'WAITING_FOR_REVIEW';
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, jobTitle: true, photoUrl: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          proofs: { select: { id: true, fileUrl: true, fileName: true, createdAt: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      data: tasks,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/tasks/:id
// Get a single task with full details.
// ---------------------------------------------------------------------------
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        assignee: {
          select: {
            id: true, firstName: true, lastName: true, jobTitle: true, photoUrl: true,
            userId: true,
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        proofs: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // RBAC: employees can only see their own tasks
    if (!canManageTasks(req.user.role)) {
      const employeeId = await getEmployeeId(req.user.id);
      if (task.assigneeId !== employeeId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    res.json({ data: task });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/tasks/:id
// Update task details (title, description, priority, dueDate). Managers only.
// ---------------------------------------------------------------------------
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !canManageTasks(req.user.role)) {
      res.status(403).json({ error: 'Only managers can edit tasks' });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (['APPROVED'].includes(task.status)) {
      res.status(400).json({ error: 'Cannot edit an approved task' });
      return;
    }

    const { title, description, priority, dueDate, assigneeId } = req.body;
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        res.status(400).json({ error: 'Invalid priority' });
        return;
      }
      data.priority = priority;
    }
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (assigneeId !== undefined) {
      const assignee = await prisma.employee.findUnique({ where: { id: assigneeId }, select: { id: true } });
      if (!assignee) {
        res.status(404).json({ error: 'Assignee not found' });
        return;
      }
      data.assigneeId = assigneeId;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const before = { title: task.title, description: task.description, priority: task.priority, dueDate: task.dueDate };

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        proofs: true,
      },
    });

    await createAuditLog({
      actorId: req.user.id,
      action: AuditAction.TASK_UPDATED,
      objectType: 'Task',
      objectId: task.id,
      before: before as any,
      after: data as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    res.json({ data: updated });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/status
// Change task status with validation. body: { status: "IN_PROGRESS" }
// ---------------------------------------------------------------------------
router.post('/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { status: newStatus } = req.body;

    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        proofs: { select: { id: true } },
        assignee: { select: { id: true, userId: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, userId: true, firstName: true, lastName: true } },
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Check valid transition
    const allowed = STATUS_TRANSITIONS[task.status] || [];
    if (!allowed.includes(newStatus)) {
      res.status(400).json({ error: `Cannot transition from ${task.status} to ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}` });
      return;
    }

    // RBAC: who can make which transitions?
    const employeeId = await getEmployeeId(req.user.id);
    const isAssignee = task.assigneeId === employeeId;
    const isManager = canManageTasks(req.user.role);

    // Assignee can: OPEN→IN_PROGRESS, IN_PROGRESS→COMPLETED/WAITING_FOR_REVIEW, COMPLETED→WAITING_FOR_REVIEW, REJECTED→IN_PROGRESS
    // Manager can: WAITING_FOR_REVIEW→APPROVED/REJECTED (review actions)
    if (['IN_PROGRESS'].includes(newStatus) && task.status === 'OPEN' && !isAssignee && !isManager) {
      res.status(403).json({ error: 'Only the assignee can start this task' });
      return;
    }
    if (['COMPLETED', 'WAITING_FOR_REVIEW'].includes(newStatus) && !isAssignee && !isManager) {
      res.status(403).json({ error: 'Only the assignee can mark tasks as completed' });
      return;
    }
    if (['APPROVED', 'REJECTED'].includes(newStatus) && !isManager) {
      res.status(403).json({ error: 'Only managers can approve or reject tasks' });
      return;
    }

    // Validate: need >= 3 proofs for COMPLETED or WAITING_FOR_REVIEW
    if (['COMPLETED', 'WAITING_FOR_REVIEW'].includes(newStatus) && task.proofs.length < MIN_PROOFS_FOR_COMPLETE) {
      res.status(400).json({
        error: `At least ${MIN_PROOFS_FOR_COMPLETE} proof files are required before completing a task. Currently: ${task.proofs.length}`,
      });
      return;
    }

    const updateData: any = { status: newStatus };
    if (newStatus === 'COMPLETED' || newStatus === 'WAITING_FOR_REVIEW') {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, photoUrl: true, userId: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, userId: true } },
        proofs: true,
      },
    });

    await createAuditLog({
      actorId: req.user.id,
      action: AuditAction.TASK_STATUS_CHANGED,
      objectType: 'Task',
      objectId: task.id,
      before: { status: task.status } as any,
      after: { status: newStatus } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    // Notifications
    if (newStatus === 'WAITING_FOR_REVIEW') {
      // Notify task creator that task is ready for review
      await createNotification(
        task.createdBy.userId,
        NotificationType.TASK_COMPLETED,
        'Task Ready for Review',
        `"${task.title}" by ${task.assignee.firstName} ${task.assignee.lastName} is waiting for your review`,
        `/task-review`
      );
    }

    res.json({ data: updated });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/proofs
// Upload proof files (images/PDFs). Multiple files supported.
// ---------------------------------------------------------------------------
router.post('/:id/proofs', upload.array('proofs', 10), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'At least one proof file is required' });
      return;
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      select: { id: true, assigneeId: true, status: true },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Only assignee (or managers) can upload proofs
    const employeeId = await getEmployeeId(req.user.id);
    if (task.assigneeId !== employeeId && !canManageTasks(req.user.role)) {
      res.status(403).json({ error: 'Only the task assignee can upload proofs' });
      return;
    }

    // Can only upload proofs for non-approved tasks
    if (task.status === 'APPROVED') {
      res.status(400).json({ error: 'Cannot upload proofs for an approved task' });
      return;
    }

    const proofs = await prisma.taskProof.createMany({
      data: files.map(f => ({
        taskId: task.id,
        fileUrl: `/uploads/proofs/${f.filename}`,
        fileName: f.originalname,
        fileSize: f.size,
        mimeType: f.mimetype,
        uploadedBy: req.user!.id,
      })),
    });

    await createAuditLog({
      actorId: req.user.id,
      action: AuditAction.TASK_PROOF_UPLOADED,
      objectType: 'Task',
      objectId: task.id,
      after: { fileCount: files.length, fileNames: files.map(f => f.originalname) } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    // Return updated task with proofs
    const updated = await prisma.task.findUnique({
      where: { id: task.id },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        proofs: { orderBy: { createdAt: 'asc' } },
      },
    });

    res.status(201).json({ data: updated });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/review
// Approve or reject a task. body: { action: "APPROVED"|"REJECTED", rating: 1-5, comment: "" }
// ---------------------------------------------------------------------------
router.post('/:id/review', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !canManageTasks(req.user.role)) {
      res.status(403).json({ error: 'Only managers can review tasks' });
      return;
    }

    const { action, rating, comment } = req.body;

    if (!action || !['APPROVED', 'REJECTED'].includes(action)) {
      res.status(400).json({ error: 'action must be APPROVED or REJECTED' });
      return;
    }

    if (rating !== undefined && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
      res.status(400).json({ error: 'rating must be between 1 and 5' });
      return;
    }

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        assignee: { select: { id: true, userId: true, firstName: true, lastName: true } },
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (task.status !== 'WAITING_FOR_REVIEW') {
      res.status(400).json({ error: 'Task is not waiting for review' });
      return;
    }

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        status: action,
        reviewRating: rating || null,
        reviewComment: comment || null,
        reviewedById: req.user.id,
        reviewedAt: new Date(),
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        proofs: true,
      },
    });

    const auditAction = action === 'APPROVED' ? AuditAction.TASK_APPROVED : AuditAction.TASK_REJECTED;
    await createAuditLog({
      actorId: req.user.id,
      action: auditAction,
      objectType: 'Task',
      objectId: task.id,
      after: { status: action, rating, comment } as any,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    // Notify the assignee
    const notifType = action === 'APPROVED' ? NotificationType.TASK_APPROVED : NotificationType.TASK_REJECTED;
    const notifTitle = action === 'APPROVED' ? 'Task Approved' : 'Task Rejected';
    const ratingStr = rating ? ` (Rating: ${rating}/5)` : '';
    const notifMsg = action === 'APPROVED'
      ? `Your task "${task.title}" has been approved${ratingStr}`
      : `Your task "${task.title}" was rejected${comment ? `: ${comment}` : ''}`;

    await createNotification(task.assignee.userId, notifType, notifTitle, notifMsg, `/tasks`);

    // Recalculate employee performance score on task review
    try {
      const { calculateAndSaveScore } = await import('../scores/score.service');
      await calculateAndSaveScore(task.assigneeId, req.user.id, 6, true);
    } catch { /* non-critical */ }

    res.json({ data: updated });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/tasks/stats/summary
// Task statistics for dashboard.
// ---------------------------------------------------------------------------
router.get('/stats/summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const employeeId = await getEmployeeId(req.user.id);
    const isManager = canManageTasks(req.user.role);

    const baseWhere = !isManager && employeeId ? { assigneeId: employeeId } : {};

    const [open, inProgress, waitingReview, approved, rejected] = await Promise.all([
      prisma.task.count({ where: { ...baseWhere, status: 'OPEN' } }),
      prisma.task.count({ where: { ...baseWhere, status: 'IN_PROGRESS' } }),
      prisma.task.count({ where: { ...baseWhere, status: 'WAITING_FOR_REVIEW' } }),
      prisma.task.count({ where: { ...baseWhere, status: 'APPROVED' } }),
      prisma.task.count({ where: { ...baseWhere, status: 'REJECTED' } }),
    ]);

    res.json({
      data: { open, inProgress, waitingReview, approved, rejected, total: open + inProgress + waitingReview + approved + rejected },
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
