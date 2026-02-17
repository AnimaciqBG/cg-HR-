import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import logger from './config/logger';
import prisma from './config/database';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import employeesRoutes from './modules/employees/employees.routes';
import shiftsRoutes from './modules/shifts/shifts.routes';
import timeEntriesRoutes from './modules/time-entries/time-entries.routes';
import breaksRoutes from './modules/breaks/breaks.routes';
import leavesRoutes from './modules/leaves/leaves.routes';
import documentsRoutes from './modules/documents/documents.routes';
import performanceRoutes from './modules/performance/performance.routes';
import goalsRoutes from './modules/goals/goals.routes';
import trainingRoutes from './modules/training/training.routes';
import announcementsRoutes from './modules/announcements/announcements.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import reportsRoutes from './modules/reports/reports.routes';
import adminRoutes from './modules/admin/admin.routes';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many authentication attempts' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/verify-2fa', authLimiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/time-entries', timeEntriesRoutes);
app.use('/api/breaks', breaksRoutes);
app.use('/api/leaves', leavesRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
      logger.info(`CORS origin: ${config.corsOrigin}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

bootstrap();

export default app;
