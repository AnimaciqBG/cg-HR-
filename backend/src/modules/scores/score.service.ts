import prisma from '../../config/database';

// ---------------------------------------------------------------------------
// Scoring Formula (total 0-100):
//
//   taskRatingScore     (0-40) : avg task reviewRating (1-5) → normalized × 40
//   taskCompletionScore (0-25) : approvedTasks / totalTasks × 25
//   consistencyScore    (0-20) : on-time completion rate × 20
//   disciplinaryScore   (0-15) : starts at 15, −5 per active warning
//
// Grade: A (90+), B (75-89), C (60-74), D (40-59), F (<40)
// ---------------------------------------------------------------------------

const WEIGHT_RATING = 40;
const WEIGHT_COMPLETION = 25;
const WEIGHT_CONSISTENCY = 20;
const WEIGHT_DISCIPLINE_BASE = 15;
const PENALTY_PER_WARNING = 5;

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export interface ScoreResult {
  totalScore: number;
  grade: string;
  taskRatingScore: number;
  taskCompletionScore: number;
  consistencyScore: number;
  disciplinaryScore: number;
  totalTasks: number;
  approvedTasks: number;
  rejectedTasks: number;
  avgRating: number;
  onTimeRate: number;
  warningCount: number;
}

/**
 * Calculate the performance score for one employee over the last N months.
 */
export async function calculateScore(
  employeeId: string,
  periodMonths: number = 6
): Promise<ScoreResult> {
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setMonth(periodStart.getMonth() - periodMonths);

  // 1. Fetch tasks assigned to this employee within the period
  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: employeeId,
      createdAt: { gte: periodStart, lte: periodEnd },
      status: { in: ['APPROVED', 'REJECTED'] },
    },
    select: {
      id: true,
      status: true,
      reviewRating: true,
      dueDate: true,
      completedAt: true,
    },
  });

  const totalTasks = tasks.length;
  const approvedTasks = tasks.filter(t => t.status === 'APPROVED').length;
  const rejectedTasks = tasks.filter(t => t.status === 'REJECTED').length;

  // Rating score: average of reviewRating (1-5) → normalize to 0-40
  const ratedTasks = tasks.filter(t => t.reviewRating != null);
  const avgRating = ratedTasks.length > 0
    ? ratedTasks.reduce((sum, t) => sum + (t.reviewRating || 0), 0) / ratedTasks.length
    : 0;
  const taskRatingScore = avgRating > 0
    ? Math.round(((avgRating - 1) / 4) * WEIGHT_RATING * 100) / 100  // (1→0, 5→40)
    : 0;

  // Completion score: approved / total × 25
  const taskCompletionScore = totalTasks > 0
    ? Math.round((approvedTasks / totalTasks) * WEIGHT_COMPLETION * 100) / 100
    : 0;

  // Consistency: on-time rate (completed before or on dueDate)
  const tasksWithDue = tasks.filter(t => t.dueDate && t.completedAt);
  const onTimeTasks = tasksWithDue.filter(t => {
    const due = new Date(t.dueDate!);
    const completed = new Date(t.completedAt!);
    return completed <= due;
  });
  const onTimeRate = tasksWithDue.length > 0
    ? onTimeTasks.length / tasksWithDue.length
    : (totalTasks > 0 ? 0.5 : 0); // if no due dates set, neutral 50%
  const consistencyScore = Math.round(onTimeRate * WEIGHT_CONSISTENCY * 100) / 100;

  // Discipline: base 15, minus 5 per active warning
  const warnings = await prisma.disciplinaryRecord.count({
    where: {
      employeeId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });
  const disciplinaryScore = Math.max(0, WEIGHT_DISCIPLINE_BASE - warnings * PENALTY_PER_WARNING);

  const totalScore = Math.round(
    (taskRatingScore + taskCompletionScore + consistencyScore + disciplinaryScore) * 100
  ) / 100;

  return {
    totalScore: Math.min(100, Math.max(0, totalScore)),
    grade: computeGrade(totalScore),
    taskRatingScore,
    taskCompletionScore,
    consistencyScore,
    disciplinaryScore,
    totalTasks,
    approvedTasks,
    rejectedTasks,
    avgRating: Math.round(avgRating * 100) / 100,
    onTimeRate: Math.round(onTimeRate * 100) / 100,
    warningCount: warnings,
  };
}

/**
 * Calculate and persist score snapshot for one employee.
 */
export async function calculateAndSaveScore(
  employeeId: string,
  calculatedBy: string = 'system',
  periodMonths: number = 6,
  isRecalculation: boolean = false
): Promise<typeof prisma.employeeScore extends { create: (args: any) => Promise<infer R> } ? R : never> {
  const score = await calculateScore(employeeId, periodMonths);

  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setMonth(periodStart.getMonth() - periodMonths);

  // Deactivate previous "latest" scores
  await prisma.employeeScore.updateMany({
    where: { employeeId, isLatest: true },
    data: { isLatest: false },
  });

  const snapshot = await prisma.employeeScore.create({
    data: {
      employeeId,
      ...score,
      periodStart,
      periodEnd,
      calculatedBy,
      isLatest: true,
    },
  });

  return snapshot;
}

/**
 * Calculate scores for ALL active employees.
 */
export async function calculateAllScores(
  calculatedBy: string = 'system',
  periodMonths: number = 6
): Promise<number> {
  const employees = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });

  let count = 0;
  for (const emp of employees) {
    await calculateAndSaveScore(emp.id, calculatedBy, periodMonths, false);
    count++;
  }

  return count;
}
