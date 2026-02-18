-- AlterEnum: AuditAction
ALTER TYPE "AuditAction" ADD VALUE 'SCORE_CALCULATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCORE_RECALCULATED';

-- CreateTable: employee_scores
CREATE TABLE "employee_scores" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL,
    "taskRatingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taskCompletionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consistencyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disciplinaryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "approvedTasks" INTEGER NOT NULL DEFAULT 0,
    "rejectedTasks" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "onTimeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedBy" TEXT,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_scores_employeeId_idx" ON "employee_scores"("employeeId");
CREATE INDEX "employee_scores_isLatest_idx" ON "employee_scores"("isLatest");
CREATE INDEX "employee_scores_calculatedAt_idx" ON "employee_scores"("calculatedAt");

-- AddForeignKey
ALTER TABLE "employee_scores" ADD CONSTRAINT "employee_scores_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
