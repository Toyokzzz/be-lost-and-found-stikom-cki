import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      message: 'Validasi form gagal. Periksa kembali input data Anda.',
      errors,
    });
    return;
  }

  // 2. Multer File Upload Errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        message: 'Ukuran file foto melebihi batas maksimal 2MB!',
      });
      return;
    }
    res.status(400).json({
      success: false,
      message: `Error upload file: ${err.message}`,
    });
    return;
  }

  // 3. Known App Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // 4. Default / Unexpected Errors
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Terjadi kesalahan internal pada server.',
  });
}
