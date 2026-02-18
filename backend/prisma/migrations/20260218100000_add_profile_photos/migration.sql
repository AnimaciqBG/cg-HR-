-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PHOTO_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'PHOTO_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'PHOTO_REJECTED';

-- CreateTable
CREATE TABLE "profile_photos" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_photos_employeeId_idx" ON "profile_photos"("employeeId");

-- CreateIndex
CREATE INDEX "profile_photos_status_idx" ON "profile_photos"("status");

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
