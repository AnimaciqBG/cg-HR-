import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { authGuard, AuthenticatedRequest } from '../../common/guards/auth.guard';
import {
  requirePermission,
  requireAnyPermission,
  hasPermission,
} from '../../common/guards/rbac.guard';
import { getClientIp, getUserAgent } from '../../common/utils/audit';
import { documentsService } from './documents.service';
import { DocumentCategory } from '@prisma/client';

// ---------------------------------------------------------------------------
// Multer configuration
// ---------------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(process.cwd(), 'uploads', 'documents'));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/plain',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

const router = Router();

// ---------------------------------------------------------------------------
// All document routes require authentication
// ---------------------------------------------------------------------------
router.use(authGuard);

// ---------------------------------------------------------------------------
// GET /api/documents/expiring
// Returns documents expiring within N days. HR / Admin only.
// Must be registered BEFORE the /:id route to avoid param collision.
// ---------------------------------------------------------------------------
router.get(
  '/expiring',
  requireAnyPermission('documents:read_all'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const daysAhead = Math.min(
        365,
        Math.max(1, parseInt(String(req.query.days || '30'), 10))
      );

      const documents = await documentsService.getExpiringDocuments(daysAhead);
      res.json({ data: documents });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/documents/templates
// List all document templates. Accessible to anyone who can write documents.
// ---------------------------------------------------------------------------
router.get(
  '/templates',
  requireAnyPermission('documents:write'),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const templates = await documentsService.listTemplates();
      res.json({ data: templates });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/documents/templates
// Create a document template. HR / Admin only.
// ---------------------------------------------------------------------------
router.post(
  '/templates',
  requireAnyPermission('documents:write', 'documents:delete'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, category, content, isActive } = req.body;

      if (!name || !category || !content) {
        res.status(400).json({ error: 'name, category, and content are required' });
        return;
      }

      // Validate category enum
      if (!Object.values(DocumentCategory).includes(category as DocumentCategory)) {
        res.status(400).json({ error: `Invalid category. Must be one of: ${Object.values(DocumentCategory).join(', ')}` });
        return;
      }

      const result = await documentsService.createTemplate({
        name,
        category: category as DocumentCategory,
        content,
        isActive,
      });

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json({ data: result.template });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/documents/templates/:id
// Update a document template. HR / Admin only.
// ---------------------------------------------------------------------------
router.put(
  '/templates/:id',
  requireAnyPermission('documents:write', 'documents:delete'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, category, content, isActive } = req.body;

      if (
        category &&
        !Object.values(DocumentCategory).includes(category as DocumentCategory)
      ) {
        res.status(400).json({ error: `Invalid category. Must be one of: ${Object.values(DocumentCategory).join(', ')}` });
        return;
      }

      const result = await documentsService.updateTemplate(req.params.id, {
        name,
        category: category as DocumentCategory | undefined,
        content,
        isActive,
      });

      if (!result.success) {
        const status = result.error === 'Template not found' ? 404 : 400;
        res.status(status).json({ error: result.error });
        return;
      }

      res.json({ data: result.template });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/documents
// List documents with filtering, search, and RBAC scoping.
// ---------------------------------------------------------------------------
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const filters: Record<string, unknown> = {};
    if (req.query.employeeId) filters.employeeId = req.query.employeeId as string;
    if (req.query.search) filters.search = req.query.search as string;
    if (req.query.page) filters.page = parseInt(String(req.query.page), 10);
    if (req.query.limit) filters.limit = parseInt(String(req.query.limit), 10);
    if (req.query.isExpiring === 'true') filters.isExpiring = true;

    if (
      req.query.category &&
      Object.values(DocumentCategory).includes(req.query.category as DocumentCategory)
    ) {
      filters.category = req.query.category as DocumentCategory;
    }

    const result = await documentsService.listDocuments(
      filters as {
        employeeId?: string;
        category?: DocumentCategory;
        search?: string;
        isExpiring?: boolean;
        page?: number;
        limit?: number;
      },
      req.user.id,
      req.user.role
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/:id
// Get a single document with RBAC check. Also tracks the download.
// ---------------------------------------------------------------------------
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await documentsService.getDocument(
      req.params.id,
      req.user.id,
      req.user.role
    );

    if (!result.success) {
      const status = result.error === 'Access denied' || result.error === 'Access denied to confidential document'
        ? 403
        : 404;
      res.status(status).json({ error: result.error });
      return;
    }

    // Track the download in the audit log
    await documentsService.trackDownload(
      req.params.id,
      req.user.id,
      getClientIp(req),
      getUserAgent(req)
    );

    res.json({ data: result.document });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/documents
// Upload a new document. Requires documents:write permission.
// Accepts multipart/form-data with a "file" field.
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAnyPermission('documents:write'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'File is required' });
        return;
      }

      const { title, description, category, employeeId, assignedToId, expiresAt, isConfidential } =
        req.body;

      if (!title) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      // Validate category if provided
      if (
        category &&
        !Object.values(DocumentCategory).includes(category as DocumentCategory)
      ) {
        res.status(400).json({ error: `Invalid category. Must be one of: ${Object.values(DocumentCategory).join(', ')}` });
        return;
      }

      // Only HR / Admin can upload confidential documents
      if (
        isConfidential === 'true' &&
        !hasPermission(req.user.role, 'documents:read_all')
      ) {
        res.status(403).json({ error: 'Only HR and Admin can mark documents as confidential' });
        return;
      }

      const result = await documentsService.uploadDocument(
        {
          title,
          description,
          category: (category as DocumentCategory) || undefined,
          employeeId,
          assignedToId,
          expiresAt,
          isConfidential: isConfidential === 'true',
        },
        {
          originalname: req.file.originalname,
          filename: req.file.filename,
          path: req.file.path,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
        req.user.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json({ data: result.document });
    } catch (error) {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'File size exceeds the 20MB limit' });
          return;
        }
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/documents/:id
// Update document metadata. Requires documents:write permission.
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  requireAnyPermission('documents:write'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { title, description, category, employeeId, assignedToId, expiresAt, isConfidential } =
        req.body;

      // Validate category if provided
      if (
        category &&
        !Object.values(DocumentCategory).includes(category as DocumentCategory)
      ) {
        res.status(400).json({ error: `Invalid category. Must be one of: ${Object.values(DocumentCategory).join(', ')}` });
        return;
      }

      // Only HR / Admin can toggle confidential flag
      if (
        isConfidential !== undefined &&
        !hasPermission(req.user.role, 'documents:read_all')
      ) {
        res.status(403).json({ error: 'Only HR and Admin can change confidential status' });
        return;
      }

      const data: Record<string, unknown> = {};
      if (title !== undefined) data.title = title;
      if (description !== undefined) data.description = description;
      if (category !== undefined) data.category = category as DocumentCategory;
      if (employeeId !== undefined) data.employeeId = employeeId || null;
      if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
      if (expiresAt !== undefined) data.expiresAt = expiresAt || null;
      if (isConfidential !== undefined) data.isConfidential = isConfidential;

      if (Object.keys(data).length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      const result = await documentsService.updateDocument(
        req.params.id,
        data as Parameters<typeof documentsService.updateDocument>[1],
        req.user.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        const status = result.error === 'Document not found' ? 404 : 400;
        res.status(status).json({ error: result.error });
        return;
      }

      res.json({ data: result.document });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/documents/:id
// Soft-delete a document. Requires documents:delete permission.
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  requireAnyPermission('documents:delete'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await documentsService.deleteDocument(
        req.params.id,
        req.user.id,
        getClientIp(req),
        getUserAgent(req)
      );

      if (!result.success) {
        res.status(404).json({ error: result.error });
        return;
      }

      res.json({ message: 'Document deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
