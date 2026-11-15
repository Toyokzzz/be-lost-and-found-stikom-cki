import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';
import { authenticate } from './middlewares/auth.middleware';
import { errorHandler } from './middlewares/errorHandler';
import { config } from './config';

export const app = express();

// Middlewares — Izinkan semua origin untuk deployment Vercel
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Handle preflight OPTIONS request secara eksplisit
app.options('*', cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach user payload from JWT if present
app.use(authenticate);

// Serve static uploads
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadPath = isServerless
  ? path.resolve('/tmp', config.uploadDir)
  : path.resolve(process.cwd(), config.uploadDir);
app.use('/uploads', express.static(uploadPath));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'Lost and Found Kampus API Server is running smoothly.',
    timestamp: new Date().toISOString(),
    timezone: config.timezone,
  });
});

// API Routes
app.use('/api', routes);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint API tidak ditemukan.',
  });
});

// Global Error Handler
app.use(errorHandler);
