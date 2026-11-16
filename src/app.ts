import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';
import { authenticate } from './middlewares/auth.middleware';
import { errorHandler } from './middlewares/errorHandler';
import { config } from './config';

export const app = express();

// Whitelist Domain Terpercaya (SEC-05)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  config.clientUrl,
].filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Izinkan request tanpa origin header (mobile app, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }
    // Cek daftar origin lokal dan clientUrl
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Cek domain resmi Vercel project (termasuk jejakbarangstikomcki.vercel.app dan preview URLs)
    if (/^https:\/\/([a-zA-Z0-9_-]+\.)?vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    // Tolak domain tidak dikenal di luar whitelist
    return callback(new Error('Akses diblokir oleh kebijakan keamanan CORS.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middlewares
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach user payload from JWT if present
app.use(authenticate);

// Serve static uploads dengan header perlindungan Stored XSS (SEC-04)
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadPath = isServerless
  ? path.resolve('/tmp', config.uploadDir)
  : path.resolve(process.cwd(), config.uploadDir);

app.use(
  '/uploads',
  express.static(uploadPath, {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

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
