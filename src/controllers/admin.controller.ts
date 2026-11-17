import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AppError } from '../middlewares/errorHandler';
import { buildPhotoUrl } from '../utils/photoUrl';

/**
 * Statistik Ringkasan Sistem untuk Dashboard Admin (SRS-FR-007).
 */
export async function getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [
      totalFound,
      activeFound,
      completedFound,
      totalLost,
      activeLost,
      expiredLost,
      totalClaims,
      completedClaims,
      totalUsers,
    ] = await Promise.all([
      prisma.foundItem.count(),
      prisma.foundItem.count({ where: { status: 'active' } }),
      prisma.foundItem.count({ where: { status: 'completed' } }),
      prisma.lostReport.count(),
      prisma.lostReport.count({ where: { status: 'active' } }),
      prisma.lostReport.count({ where: { status: 'expired' } }),
      prisma.claim.count(),
      prisma.claim.count({ where: { status: 'handed_over' } }),
      prisma.user.count({ where: { role: 'mahasiswa' } }),
    ]);

    const returnRate = totalFound > 0 ? ((completedFound / totalFound) * 100).toFixed(1) : '0';

    res.status(200).json({
      success: true,
      data: {
        totalFound,
        activeFound,
        completedFound,
        totalLost,
        activeLost,
        expiredLost,
        totalClaims,
        completedClaims,
        totalUsers,
        returnRate: `${returnRate}%`,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Mengambil semua barang temuan & laporan kehilangan untuk moderasi admin.
 */
export async function getAllAdminItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type = 'all', status } = req.query;

    let foundItems: any[] = [];
    let lostReports: any[] = [];

    if (type === 'all' || type === 'found') {
      const where: any = {};
      if (status) where.status = status;
      foundItems = await prisma.foundItem.findMany({
        where,
        include: {
          category: true,
          storage_location: true,
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              nim: true,
              prodi: true,
              semester: true,
              kelas: true,
            },
          },
          claims: {
            include: {
              claimant: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  nim: true,
                  prodi: true,
                  semester: true,
                  kelas: true,
                },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });
      foundItems = foundItems.map((i) => ({ ...i, item_type: 'found', photo_url: buildPhotoUrl(i.photo_url, req) }));
    }

    if (type === 'all' || type === 'lost') {
      const where: any = {};
      if (status) where.status = status;
      lostReports = await prisma.lostReport.findMany({
        where,
        include: {
          category: true,
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              nim: true,
              prodi: true,
              semester: true,
              kelas: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });
      lostReports = lostReports.map((i) => ({ ...i, item_type: 'lost', photo_url: buildPhotoUrl(i.photo_url, req) }));
    }

    res.status(200).json({
      success: true,
      data: {
        foundItems,
        lostReports,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Moderasi Laporan: Ubah Status atau Hapus Laporan Melanggar Aturan (SRS-FR-007).
 */
export async function moderateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type, id } = req.params;
    const { action, status } = req.body; // action: 'update_status' | 'delete'

    if (type === 'found') {
      if (action === 'delete') {
        await prisma.foundItem.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Barang temuan berhasil dihapus oleh admin.' });
        return;
      }
      if (action === 'update_status' && status) {
        const updated = await prisma.foundItem.update({
          where: { id },
          data: { status },
        });
        res.status(200).json({ success: true, message: `Status berhasil diubah menjadi ${status}.`, data: updated });
        return;
      }
    } else if (type === 'lost') {
      if (action === 'delete') {
        await prisma.lostReport.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Laporan kehilangan berhasil dihapus oleh admin.' });
        return;
      }
      if (action === 'update_status' && status) {
        const updated = await prisma.lostReport.update({
          where: { id },
          data: { status },
        });
        res.status(200).json({ success: true, message: `Status berhasil diubah menjadi ${status}.`, data: updated });
        return;
      }
    }

    throw new AppError('Aksi moderasi tidak valid.', 400);
  } catch (error) {
    next(error);
  }
}

/**
 * CRUD Master Kategori (SRS-FR-008).
 */
const categorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
});

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = categorySchema.parse(req.body);
    const cat = await prisma.category.create({ data: validated });
    res.status(201).json({ success: true, data: cat });
  } catch (error) {
    next(error);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const validated = categorySchema.parse(req.body);
    const cat = await prisma.category.update({ where: { id }, data: validated });
    res.status(200).json({ success: true, data: cat });
  } catch (error) {
    next(error);
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await prisma.category.delete({ where: { id } });
    res.status(200).json({ success: true, message: 'Kategori berhasil dihapus.' });
  } catch (error) {
    next(error);
  }
}

/**
 * CRUD Master Lokasi Front Office (SRS-FR-008).
 */
const locationSchema = z.object({
  name: z.string().min(3),
  building: z.string().min(3),
  service_hours: z.string().min(3),
  contact: z.string().min(3),
  is_active: z.boolean().default(true),
});

export async function createLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = locationSchema.parse(req.body);
    const loc = await prisma.storageLocation.create({ data: validated });
    res.status(201).json({ success: true, data: loc });
  } catch (error) {
    next(error);
  }
}

export async function updateLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const validated = locationSchema.parse(req.body);
    const loc = await prisma.storageLocation.update({ where: { id }, data: validated });
    res.status(200).json({ success: true, data: loc });
  } catch (error) {
    next(error);
  }
}

export async function toggleLocationActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const loc = await prisma.storageLocation.findUnique({ where: { id } });
    if (!loc) throw new AppError('Lokasi tidak ditemukan.', 404);

    const updated = await prisma.storageLocation.update({
      where: { id },
      data: { is_active: !loc.is_active },
    });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * Penyelesaian Status Klaim Macet oleh Admin (SRS-FR-007).
 */
export async function resolveStuckClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { claim_id, action } = req.body; // action: 'force_handover' | 'reject'

    const claim = await prisma.claim.findUnique({
      where: { id: claim_id },
      include: { found_item: true },
    });

    if (!claim) throw new AppError('Klaim tidak ditemukan.', 404);

    if (action === 'force_handover') {
      await prisma.$transaction(async (tx) => {
        await tx.claim.update({
          where: { id: claim_id },
          data: { status: 'handed_over', handed_over_at: new Date() },
        });
        await tx.foundItem.update({
          where: { id: claim.found_item_id },
          data: { status: 'completed' },
        });
      });
      res.status(200).json({ success: true, message: 'Klaim berhasil diselesaikan oleh Admin.' });
      return;
    }

    if (action === 'reject') {
      await prisma.$transaction(async (tx) => {
        await tx.claim.update({
          where: { id: claim_id },
          data: { status: 'rejected' },
        });
        await tx.foundItem.update({
          where: { id: claim.found_item_id },
          data: { status: 'active' },
        });
      });
      res.status(200).json({ success: true, message: 'Klaim dibatalkan dan barang dikembalikan ke status aktif.' });
      return;
    }

    throw new AppError('Aksi tidak valid.', 400);
  } catch (error) {
    next(error);
  }
}

/**
 * Data Khusus Panel Admin Front Office (FO) (SRS & User Request 7).
 * Menampilkan daftar barang temuan beserta:
 * - Kode unik klaim (claim_code) dari si pengklaim
 * - Pertanyaan validasi (validation_question) dari pelapor penemu
 * - Jawaban validasi (hidden_detail) dari pelapor penemu
 * - Nama & data si pengklaim barang
 * CATATAN: Tombol "barang sudah diklaim" dipindah ke sisi user/pelapor,
 *          tampilan FO hanya untuk pencocokan kode unik.
 */
export async function getFODashboardData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { search, status } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const items = await prisma.foundItem.findMany({
      where,
      include: {
        category: true,
        storage_location: true,
        reporter: {
          select: {
            id: true,
            name: true,
            nim: true,
            prodi: true,
            semester: true,
            kelas: true,
            phone: true,
            email: true,
          },
        },
        claims: {
          include: {
            claimant: {
              select: {
                id: true,
                name: true,
                nim: true,
                prodi: true,
                semester: true,
                kelas: true,
                phone: true,
                email: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    let filteredItems = items;
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredItems = items.filter((item) => {
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchCode = item.claims.some((c) => c.claim_code.toLowerCase().includes(q));
        const matchClaimant = item.claims.some(
          (c) =>
            c.claimant?.name?.toLowerCase().includes(q) ||
            c.claimant?.nim?.toLowerCase().includes(q)
        );
        return matchTitle || matchCode || matchClaimant;
      });
    }

    // Format response FO: hanya tampilkan kode unik, pertanyaan, jawaban dari pelapor
    // dan data pengklaim (nama, kode unik) untuk pencocokan di loket
    const foFormattedItems = filteredItems.map((item) => {
      const activeClaim = item.claims.find((c) => c.status === 'claimed' || c.status === 'handed_over') || null;
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        // Normalisasi photo_url agar gambar tampil di admin FO
        photo_url: buildPhotoUrl(item.photo_url, req),
        location_found: item.location_found,
        status: item.status,
        created_at: item.created_at,
        category: item.category,
        storage_location: item.storage_location,
        // Data pelapor penemu + pertanyaan & jawaban validasi (untuk FO)
        reporter: item.reporter,
        validation_question: item.validation_question,
        hidden_detail: item.hidden_detail, // Jawaban validasi dari pelapor
        // Data pengklaim: kode unik untuk dicocokkan FO
        active_claim: activeClaim ? {
          id: activeClaim.id,
          claim_code: activeClaim.claim_code,  // Kode unik pengklaim
          status: activeClaim.status,
          claimed_at: activeClaim.claimed_at,
          handed_over_at: activeClaim.handed_over_at,
          claimant: activeClaim.claimant,       // Data lengkap pengklaim
        } : null,
        claims: item.claims, // Menyertakan array klaim lengkap untuk panel FO
        total_claims: item.claims.length,
      };
    });

    res.status(200).json({
      success: true,
      data: foFormattedItems,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Pencocokan Claim Code & Verifikasi Penyerahan Fisik oleh Admin FO.
 */
export async function verifyFOCodeAndHandover(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { claim_code, claim_id } = req.body;

    if (!claim_code && !claim_id) {
      throw new AppError('Kode klaim atau ID klaim wajib disertakan.', 400);
    }

    const claim = await prisma.claim.findFirst({
      where: claim_id ? { id: claim_id } : { claim_code: (claim_code || '').trim().toUpperCase() },
      include: {
        found_item: true,
        claimant: {
          select: { id: true, name: true, nim: true, prodi: true, semester: true, kelas: true, phone: true },
        },
      },
    });

    if (!claim) {
      throw new AppError('Claim Code tidak ditemukan dalam sistem.', 404);
    }

    if (claim.status === 'handed_over') {
      throw new AppError('Barang dengan Claim Code ini sudah pernah diserahterimakan.', 400);
    }

    // Eksekusi serah terima fisik resmi di loket FO
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.claim.update({
        where: { id: claim.id },
        data: { status: 'handed_over', handed_over_at: now },
      });
      await tx.foundItem.update({
        where: { id: claim.found_item_id },
        data: { status: 'completed' },
      });
      if (claim.lost_report_id) {
        await tx.lostReport.update({
          where: { id: claim.lost_report_id },
          data: { status: 'completed' },
        });
      }
    });

    res.status(200).json({
      success: true,
      message: `Verifikasi Claim Code (${claim.claim_code}) BERHASIL! Penyerahan barang fisik resmi tercatat selesai.`,
      data: {
        claim_code: claim.claim_code,
        item_title: claim.found_item.title,
        claimant: claim.claimant,
        handed_over_at: now,
      },
    });
  } catch (error) {
    next(error);
  }
}
