import {
  AuditAction,
  DocumentCategory,
  UserRole,
  Prisma,
} from '@prisma/client';
import prisma from '../../config/database';
import { createAuditLog } from '../../common/utils/audit';
import { hasPermission, Permission } from '../../common/guards/rbac.guard';
import {
  PaginationParams,
  PaginatedResult,
  buildPaginatedResult,
} from '../../common/utils/pagination';
import logger from '../../config/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListDocumentsFilters {
  employeeId?: string;
  category?: DocumentCategory;
  search?: string;
  isExpiring?: boolean;
  page?: number;
  limit?: number;
}

interface UploadDocumentData {
  title: string;
  description?: string;
  category?: DocumentCategory;
  employeeId?: string;
  assignedToId?: string;
  expiresAt?: Date | string;
  isConfidential?: boolean;
}

interface FilePayload {
  originalname: string;
  filename: string;
  path: string;
  size: number;
  mimetype: string;
}

interface UpdateDocumentData {
  title?: string;
  description?: string | null;
  category?: DocumentCategory;
  employeeId?: string | null;
  assignedToId?: string | null;
  expiresAt?: Date | string | null;
  isConfidential?: boolean;
}

interface CreateTemplateData {
  name: string;
  category: DocumentCategory;
  content: string;
  isActive?: boolean;
}

interface UpdateTemplateData {
  name?: string;
  category?: DocumentCategory;
  content?: string;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Select shapes
// ---------------------------------------------------------------------------

const DOCUMENT_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  fileUrl: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  version: true,
  previousVersion: true,
  expiresAt: true,
  signedAt: true,
  signedById: true,
  isConfidential: true,
  employeeId: true,
  assignedToId: true,
  templateId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  employee: {
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  },
  assignedTo: {
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  },
  template: {
    select: { id: true, name: true },
  },
} satisfies Prisma.DocumentSelect;

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  category: true,
  content: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentTemplateSelect;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DocumentsService {
  // -----------------------------------------------------------------------
  // LIST DOCUMENTS
  // -----------------------------------------------------------------------

  async listDocuments(
    filters: ListDocumentsFilters,
    userId: string,
    userRole: UserRole
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

    const where: Prisma.DocumentWhereInput = { deletedAt: null };

    // ----- RBAC scoping -----
    // Look up the actor's employee record once, so we can scope by employee id
    const actorEmployee = await prisma.employee.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    const actorEmployeeId = actorEmployee?.id;

    if (hasPermission(userRole, 'documents:read_all')) {
      // HR / Admin / Super-Admin can see all documents
    } else {
      // Regular employees and team leads: only see their own, assigned, or
      // non-confidential documents linked to them
      where.AND = [
        {
          OR: [
            { employeeId: actorEmployeeId },
            { assignedToId: actorEmployeeId },
            // Also allow documents with no employee (company-wide, non-confidential)
            { employeeId: null, isConfidential: false },
          ],
        },
      ];
    }

    // ----- Confidential gate -----
    // Only users with documents:read_all can see confidential documents that
    // are not directly theirs or assigned to them
    if (!hasPermission(userRole, 'documents:read_all')) {
      // Already scoped above: the OR clause ensures they only see their own /
      // assigned. But if a confidential doc is assigned to them, they may see
      // it.  We keep the default behaviour: if it appears in their scope, they
      // can view it. Additional fine-grained gating happens in getDocument().
    }

    // ----- Filters -----
    if (filters.employeeId) {
      where.employeeId = filters.employeeId;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.search) {
      const term = filters.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { fileName: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (filters.isExpiring) {
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      where.expiresAt = { gte: now, lte: thirtyDaysFromNow };
    }

    // ----- Query -----
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        select: DOCUMENT_SELECT,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.document.count({ where }),
    ]);

    return buildPaginatedResult(
      documents as unknown as Record<string, unknown>[],
      total,
      { page, limit, sortBy: 'createdAt', sortOrder: 'desc' }
    );
  }

  // -----------------------------------------------------------------------
  // GET SINGLE DOCUMENT
  // -----------------------------------------------------------------------

  async getDocument(
    id: string,
    userId: string,
    userRole: UserRole
  ): Promise<{ success: boolean; document?: Record<string, unknown>; error?: string }> {
    const document = await prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: DOCUMENT_SELECT,
    });

    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    // ----- RBAC check -----
    const actorEmployee = await prisma.employee.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    const actorEmployeeId = actorEmployee?.id;

    const canReadAll = hasPermission(userRole, 'documents:read_all');
    const isOwner = document.employeeId === actorEmployeeId;
    const isAssigned = document.assignedToId === actorEmployeeId;

    if (!canReadAll && !isOwner && !isAssigned) {
      return { success: false, error: 'Access denied' };
    }

    // Confidential documents require documents:read_all unless user is the
    // direct owner or assignee
    if (document.isConfidential && !canReadAll && !isOwner && !isAssigned) {
      return { success: false, error: 'Access denied to confidential document' };
    }

    return { success: true, document: document as unknown as Record<string, unknown> };
  }

  // -----------------------------------------------------------------------
  // UPLOAD DOCUMENT
  // -----------------------------------------------------------------------

  async uploadDocument(
    data: UploadDocumentData,
    file: FilePayload,
    creatorId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; document?: Record<string, unknown>; error?: string }> {
    if (!file) {
      return { success: false, error: 'File is required' };
    }

    if (!data.title) {
      return { success: false, error: 'Title is required' };
    }

    try {
      const document = await prisma.document.create({
        data: {
          title: data.title,
          description: data.description,
          category: data.category ?? 'OTHER',
          fileUrl: file.path,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          employeeId: data.employeeId || null,
          assignedToId: data.assignedToId || null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt as string) : null,
          isConfidential: data.isConfidential ?? false,
          createdBy: creatorId,
        },
        select: DOCUMENT_SELECT,
      });

      await createAuditLog({
        actorId: creatorId,
        action: AuditAction.DOCUMENT_UPLOADED,
        objectType: 'Document',
        objectId: document.id,
        after: {
          title: data.title,
          category: data.category,
          fileName: file.originalname,
          employeeId: data.employeeId,
          isConfidential: data.isConfidential,
        },
        ipAddress,
        userAgent,
      });

      return { success: true, document: document as unknown as Record<string, unknown> };
    } catch (error) {
      logger.error('Failed to upload document', { error });
      return { success: false, error: 'Failed to upload document' };
    }
  }

  // -----------------------------------------------------------------------
  // UPDATE DOCUMENT
  // -----------------------------------------------------------------------

  async updateDocument(
    id: string,
    data: UpdateDocumentData,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; document?: Record<string, unknown>; error?: string }> {
    const existing = await prisma.document.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return { success: false, error: 'Document not found' };
    }

    // Build sparse update
    const updateData: Prisma.DocumentUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.isConfidential !== undefined) updateData.isConfidential = data.isConfidential;
    if (data.expiresAt !== undefined) {
      updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt as string) : null;
    }

    // Handle relation fields via connect/disconnect
    if (data.employeeId !== undefined) {
      updateData.employee = data.employeeId
        ? { connect: { id: data.employeeId } }
        : { disconnect: true };
    }
    if (data.assignedToId !== undefined) {
      updateData.assignedTo = data.assignedToId
        ? { connect: { id: data.assignedToId } }
        : { disconnect: true };
    }

    // Snapshot for audit
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(data) as (keyof UpdateDocumentData)[]) {
      if (data[key] !== undefined) {
        before[key] = (existing as Record<string, unknown>)[key];
        after[key] = data[key];
      }
    }

    try {
      const document = await prisma.document.update({
        where: { id },
        data: updateData,
        select: DOCUMENT_SELECT,
      });

      await createAuditLog({
        actorId: userId,
        action: AuditAction.DOCUMENT_UPLOADED, // Re-use closest action
        objectType: 'Document',
        objectId: id,
        before,
        after,
        ipAddress,
        userAgent,
        metadata: { operation: 'update' },
      });

      return { success: true, document: document as unknown as Record<string, unknown> };
    } catch (error) {
      logger.error('Failed to update document', { error, id });
      return { success: false, error: 'Failed to update document' };
    }
  }

  // -----------------------------------------------------------------------
  // DELETE DOCUMENT (soft delete)
  // -----------------------------------------------------------------------

  async deleteDocument(
    id: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; error?: string }> {
    const existing = await prisma.document.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return { success: false, error: 'Document not found' };
    }

    try {
      await prisma.document.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: userId,
        },
      });

      await createAuditLog({
        actorId: userId,
        action: AuditAction.DOCUMENT_DELETED,
        objectType: 'Document',
        objectId: id,
        before: {
          title: existing.title,
          fileName: existing.fileName,
          category: existing.category,
        },
        ipAddress,
        userAgent,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete document', { error, id });
      return { success: false, error: 'Failed to delete document' };
    }
  }

  // -----------------------------------------------------------------------
  // GET EXPIRING DOCUMENTS
  // -----------------------------------------------------------------------

  async getExpiringDocuments(
    daysAhead: number = 30
  ): Promise<Record<string, unknown>[]> {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + daysAhead);

    const documents = await prisma.document.findMany({
      where: {
        deletedAt: null,
        expiresAt: {
          gte: now,
          lte: future,
        },
      },
      select: DOCUMENT_SELECT,
      orderBy: { expiresAt: 'asc' },
    });

    return documents as unknown as Record<string, unknown>[];
  }

  // -----------------------------------------------------------------------
  // TEMPLATES – LIST
  // -----------------------------------------------------------------------

  async listTemplates(): Promise<Record<string, unknown>[]> {
    const templates = await prisma.documentTemplate.findMany({
      select: TEMPLATE_SELECT,
      orderBy: { name: 'asc' },
    });

    return templates as unknown as Record<string, unknown>[];
  }

  // -----------------------------------------------------------------------
  // TEMPLATES – CREATE
  // -----------------------------------------------------------------------

  async createTemplate(
    data: CreateTemplateData
  ): Promise<{ success: boolean; template?: Record<string, unknown>; error?: string }> {
    if (!data.name || !data.content || !data.category) {
      return { success: false, error: 'name, category, and content are required' };
    }

    try {
      const template = await prisma.documentTemplate.create({
        data: {
          name: data.name,
          category: data.category,
          content: data.content,
          isActive: data.isActive ?? true,
        },
        select: TEMPLATE_SELECT,
      });

      return { success: true, template: template as unknown as Record<string, unknown> };
    } catch (error) {
      logger.error('Failed to create document template', { error });
      return { success: false, error: 'Failed to create template' };
    }
  }

  // -----------------------------------------------------------------------
  // TEMPLATES – UPDATE
  // -----------------------------------------------------------------------

  async updateTemplate(
    id: string,
    data: UpdateTemplateData
  ): Promise<{ success: boolean; template?: Record<string, unknown>; error?: string }> {
    const existing = await prisma.documentTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return { success: false, error: 'Template not found' };
    }

    const updateData: Prisma.DocumentTemplateUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    try {
      const template = await prisma.documentTemplate.update({
        where: { id },
        data: updateData,
        select: TEMPLATE_SELECT,
      });

      return { success: true, template: template as unknown as Record<string, unknown> };
    } catch (error) {
      logger.error('Failed to update document template', { error, id });
      return { success: false, error: 'Failed to update template' };
    }
  }

  // -----------------------------------------------------------------------
  // TRACK DOWNLOAD (audit log)
  // -----------------------------------------------------------------------

  async trackDownload(
    documentId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await createAuditLog({
      actorId: userId,
      action: AuditAction.DOCUMENT_DOWNLOADED,
      objectType: 'Document',
      objectId: documentId,
      ipAddress,
      userAgent,
    });
  }
}

export const documentsService = new DocumentsService();
