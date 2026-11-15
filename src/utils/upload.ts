import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config';

const uploadDir = path.resolve(process.cwd(), config.uploadDir);

// Pastikan folder uploads tersedia
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomHex = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${randomHex}${ext}`);
  },
});

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung! Hanya gambar JPEG, PNG, dan WebP yang diizinkan.'));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: config.uploadMaxSize, // 2MB
  },
  fileFilter,
});
