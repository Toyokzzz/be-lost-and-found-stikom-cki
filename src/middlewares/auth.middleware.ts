import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../utils/prisma';

export interface UserPayload {
  id: string;
  name: string;
  email: string;
  role: string; // 'mahasiswa' | 'admin_fo' | 'admin_developer' | 'admin'
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as UserPayload;
    req.user = decoded;
    return next();
  } catch (error) {
    return next();
  }
}

export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Akses ditolak. Token autentikasi tidak ditemukan atau format salah.',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as UserPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Akses ditolak. Token autentikasi tidak valid atau sudah kedaluwarsa.',
    });
    return;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Akses ditolak. Anda harus login terlebih dahulu.',
    });
    return;
  }
  next();
}

export function isAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Akses ditolak. Anda harus login terlebih dahulu.',
    });
    return;
  }

  const role = req.user.role?.toLowerCase();
  if (role !== 'admin' && role !== 'admin_developer' && role !== 'admin_fo') {
    res.status(403).json({
      success: false,
      message: 'Akses terlarang. Halaman/fitur ini hanya dapat diakses oleh Administrator.',
    });
    return;
  }

  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Akses ditolak. Anda harus login terlebih dahulu.',
      });
      return;
    }

    const userRole = (req.user.role || '').toLowerCase();
    const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());

    // Super admin ('admin') has access to all admin roles
    if (userRole === 'admin' || normalizedAllowed.includes(userRole)) {
      return next();
    }

    res.status(403).json({
      success: false,
      message: `Akses ditolak. Memerlukan peran: ${allowedRoles.join(' atau ')}.`,
    });
  };
}

export async function requireCompleteProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Akses ditolak. Anda harus login terlebih dahulu.',
    });
    return;
  }

  // Admins bypass profile completion check
  const role = (req.user.role || '').toLowerCase();
  if (role === 'admin' || role === 'admin_developer' || role === 'admin_fo') {
    return next();
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, nim: true, prodi: true, semester: true, kelas: true },
    });

    if (
      !user ||
      !user.name?.trim() ||
      !user.nim?.trim() ||
      !user.prodi?.trim() ||
      !user.semester ||
      !user.kelas?.trim()
    ) {
      res.status(403).json({
        success: false,
        isProfileIncomplete: true,
        message:
          'Profil Anda belum lengkap. Wajib mengisi Nama Lengkap, NIM, Program Studi, Semester (1-8), dan Kelas (Pagi/Malam) sebelum membuat laporan!',
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    verifyToken(req, res, () => {
      isAdmin(req, res, next);
    });
    return;
  }

  isAdmin(req, res, next);
}
