import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadDir = isServerless
  ? path.resolve('/tmp', config.uploadDir)
  : path.resolve(process.cwd(), config.uploadDir);

// Pastikan folder uploads tersedia tanpa menyebabkan crash EROFS di serverless
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.warn('[Upload] Gagal membuat direktori upload lokal (read-only filesystem):', err);
}

// Whitelist ekstensi dan MIME type resmi untuk mencegah Stored XSS (SEC-04)
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // Selalu gunakan ekstensi aman yang dipetakan dari MIME type yang telah divalidasi,
    // bukan mempercayai ekstensi mentah dari input pengguna
    const safeExt = MIME_TO_EXT[file.mimetype] || '.jpg';
    const randomHex = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${randomHex}${safeExt}`);
  },
});

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const rawExt = path.extname(file.originalname).toLowerCase();

  // Validasi ganda: MIME type DAN ekstensi file harus sesuai whitelist gambar aman
  const isMimeValid = Boolean(MIME_TO_EXT[file.mimetype]);
  const isExtValid = ALLOWED_EXTENSIONS.has(rawExt);

  if (isMimeValid && isExtValid) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung! Hanya gambar JPEG, PNG, dan WebP yang valid yang diizinkan.'));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: config.uploadMaxSize, // 2MB
  },
  fileFilter,
});
