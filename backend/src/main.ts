import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
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
import photosRoutes from './modules/photos/photos.routes';
import tasksRoutes from './modules/tasks/tasks.routes';
import scoresRoutes from './modules/scores/scores.routes';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
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
app.use('/api/photos', photosRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/scores', scoresRoutes);

// Serve uploaded files (photos, documents)
const uploadsPath = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Serve frontend static files
// Try multiple possible locations for the frontend build
const possiblePaths = [
  path.join(__dirname, '..', 'public'),
  path.join(process.cwd(), 'public'),
  '/app/backend/public',
];

const publicPath = possiblePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || possiblePaths[0];
const indexPath = path.join(publicPath, 'index.html');
const frontendExists = fs.existsSync(indexPath);

logger.info(`Frontend check: publicPath=${publicPath}, exists=${frontendExists}`);
logger.info(`Checked paths: ${possiblePaths.map(p => `${p} (${fs.existsSync(path.join(p, 'index.html'))})`).join(', ')}`);
logger.info(`__dirname=${__dirname}, cwd=${process.cwd()}, NODE_ENV=${config.nodeEnv}`);

if (frontendExists) {
  app.use(express.static(publicPath));
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(indexPath);
  });
} else {
  // Serve diagnostic info when frontend files are missing
  app.get('*', (_req, res) => {
    const diag = {
      error: 'Frontend not available',
      debug: {
        __dirname,
        cwd: process.cwd(),
        nodeEnv: config.nodeEnv,
        checkedPaths: possiblePaths.map(p => ({
          path: p,
          exists: fs.existsSync(p),
          indexExists: fs.existsSync(path.join(p, 'index.html')),
          contents: fs.existsSync(p) ? fs.readdirSync(p) : [],
        })),
        parentContents: fs.existsSync(path.join(__dirname, '..')) ? fs.readdirSync(path.join(__dirname, '..')) : [],
      },
    };
    res.status(404).json(diag);
  });
}

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
