import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AppError } from '../middlewares/errorHandler';
import { verifyAndCreateClaim, completePhysicalHandover } from '../services/claim.service';

const verifyClaimSchema = z.object({
  found_item_id: z.string().uuid('ID barang temuan tidak valid'),
  answer: z.string().min(3, 'Deskripsi ciri rahasia minimal 3 karakter'),
  lost_report_id: z.string().uuid().optional(),
});

const completeClaimSchema = z.object({
  claim_id: z.string().uuid('ID klaim tidak valid'),
});

/**
 * Pengajuan & Verifikasi Klaim Mandiri (SRS-FR-005 & CST-05 & CST-06).
 */
export async function verifyClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Anda harus login untuk mengajukan klaim kepemilikan.', 401);
    }

    const validated = verifyClaimSchema.parse(req.body);

    const result = await verifyAndCreateClaim(
      validated.found_item_id,
      req.user.id,
      validated.answer,
      validated.lost_report_id
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        claim: result.claim,
        alreadyClaimed: result.alreadyClaimed,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Konfirmasi "Barang Sudah Diterima" oleh Mahasiswa Pemilik (SRS-FR-006 & CST-07).
 */
export async function completeClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Anda harus login.', 401);
    }

    const validated = completeClaimSchema.parse(req.body);
    const role = (req.user.role || '').toLowerCase();
    const isStaffOrAdmin = role === 'admin' || role === 'admin_developer' || role === 'admin_fo';

    const updatedClaim = await completePhysicalHandover(validated.claim_id, req.user.id, isStaffOrAdmin);

    res.status(200).json({
      success: true,
      message: 'Status serah terima berhasil dikonfirmasi! Barang resmi dinyatakan selesai/diserahkan.',
      data: updatedClaim,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Mengambil daftar seluruh klaim yang pernah diajukan oleh pengguna saat ini.
 */
export async function getMyClaims(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Anda harus login.', 401);
    }

    const claims = await prisma.claim.findMany({
      where: { claimant_user_id: req.user.id },
      include: {
        found_item: {
          include: {
            storage_location: true,
            category: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    res.status(200).json({
      success: true,
      data: claims,
    });
  } catch (error) {
    next(error);
  }
}
