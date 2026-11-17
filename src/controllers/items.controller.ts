import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AppError } from '../middlewares/errorHandler';
import { checkAndConsumeLostReportQuota } from '../services/quota.service';
import { buildPhotoUrl } from '../utils/photoUrl';

// Helper: format teks ke uppercase dan sanitasi karakter (auto-capslock)
function toAlphaUppercase(val: string): string {
  if (!val) return '';
  // Ubah ke UPPERCASE dan izinkan karakter alfanumerik, spasi, serta tanda baca umum
  return val.toUpperCase().replace(/[^A-Z0-9\s\-.,()?!/]/g, '').trim();
}

const alphaStringField = (minLen: number, label: string) =>
  z
    .string()
    .min(1, `${label} wajib diisi`)
    .transform((val) => toAlphaUppercase(val))
    .refine((val) => val.length >= minLen, {
      message: `${label} minimal ${minLen} karakter`,
    });

const reportFoundSchema = z.object({
  title: z
    .string()
    .min(3, 'Nama barang minimal 3 karakter')
    .max(150)
    .transform((v) => toAlphaUppercase(v)),
  category_id: z.string().uuid('Kategori tidak valid'),
  storage_location_id: z.string().uuid('Lokasi loket Front Office wajib dipilih'),
  description: alphaStringField(5, 'Deskripsi umum barang'),
  location_found: z
    .string()
    .min(2, 'Lokasi ditemukan minimal 2 karakter')
    .default('Area Kampus STIKOM CKI')
    .transform((v) => toAlphaUppercase(v) || 'AREA KAMPUS STIKOM CKI'),
  validation_question: alphaStringField(3, 'Pertanyaan validasi'),
  hidden_detail: alphaStringField(2, 'Kunci jawaban validasi'),
});

const reportLostSchema = z.object({
  title: z
    .string()
    .min(3, 'Nama barang minimal 3 karakter')
    .max(150)
    .transform((v) => toAlphaUppercase(v)),
  category_id: z.string().uuid('Kategori tidak valid'),
  description: alphaStringField(5, 'Deskripsi umum barang'),
  last_seen_location: z
    .string()
    .optional()
    .default('Area Kampus STIKOM CKI')
    .transform((v) => (v ? toAlphaUppercase(v) : 'AREA KAMPUS STIKOM CKI')),
  hidden_detail: z
    .string()
    .optional()
    .default('-')
    .transform((v) => (v ? toAlphaUppercase(v) || '-' : '-')),
  contact: z.string().min(5, 'Nomor WhatsApp aktif minimal 5 karakter'),
});

/**
 * Katalog Publik & Pencarian Gabungan (Found & Lost Items).
 * Sesuai CST-05 & SRS-FR-001. Performa < 1 detik.
 */
export async function getItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      type = 'all', // 'all' | 'found' | 'lost'
      category_id,
      storage_location_id,
      status, // 'active' | 'claimed' | 'completed'
      search,
      page = '1',
      limit = '12',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const takeNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 12));
    const skipNum = (pageNum - 1) * takeNum;

    const currentUserId = req.user?.id;
    const userRole = (req.user?.role || '').toLowerCase();
    const isStaffOrAdmin = userRole === 'admin' || userRole === 'admin_fo' || userRole === 'admin_developer';

    const searchKeyword = search ? (search as string).trim() : '';

    let foundItems: any[] = [];
    let lostReports: any[] = [];
    let totalCount = 0;

    // Filter kondisi found_items
    if (type === 'all' || type === 'found') {
      const whereFound: any = {};
      if (status) {
        whereFound.status = status;
      }
      // Default katalog publik: tampilkan semua status (active, claimed, completed)
      if (category_id) whereFound.category_id = category_id as string;
      if (storage_location_id) whereFound.storage_location_id = storage_location_id as string;
      if (searchKeyword) {
        whereFound.OR = [
          { title: { contains: searchKeyword, mode: 'insensitive' } },
          { description: { contains: searchKeyword, mode: 'insensitive' } },
          { location_found: { contains: searchKeyword, mode: 'insensitive' } },
        ];
      }

      const [items, count] = await Promise.all([
        prisma.foundItem.findMany({
          where: whereFound,
          select: {
            id: true,
            title: true,
            description: true,
            photo_url: true,
            location_found: true,
            storage_status: true,
            validation_question: true,
            status: true,
            created_at: true,
            category: { select: { id: true, name: true, slug: true } },
            storage_location: { select: { id: true, name: true, building: true, service_hours: true, contact: true } },
            reporter: {
              select: {
                id: true,
                name: true,
                nim: true,
                prodi: true,
                semester: true,
                kelas: true,
                phone: true,
              },
            },
            // Sertakan data klaim aktif (claimant name & claim_code untuk tampilan publik)
            claims: {
              where: { status: { in: ['claimed', 'handed_over'] } },
              select: {
                id: true,
                claim_code: true,
                status: true,
                claimed_at: true,
                claimant_user_id: true,
                claimant: {
                  select: {
                    id: true,
                    name: true,
                    nim: true,
                  },
                },
              },
              orderBy: { created_at: 'desc' },
              take: 1,
            },
            // CST-05: Sembunyikan hidden_detail secara ketat
          },
          orderBy: { created_at: 'desc' },
          skip: type === 'found' ? skipNum : 0,
          take: type === 'found' ? takeNum : takeNum,
        }),
        prisma.foundItem.count({ where: whereFound }),
      ]);

      foundItems = items.map((i) => {
        const rawClaim = i.claims && i.claims.length > 0 ? i.claims[0] : null;
        // Kode unik hanya muncul di: pengklaim, admin FO, dan admin Dev
        const isClaimant = Boolean(currentUserId && rawClaim && rawClaim.claimant_user_id === currentUserId);
        const canSeeClaimCode = isStaffOrAdmin || isClaimant;

        return {
          ...i,
          item_type: 'found',
          // Normalisasi photo_url menjadi URL absolut agar gambar tampil di frontend
          photo_url: buildPhotoUrl(i.photo_url, req),
          // Ekspos claimant info jika ada (untuk card catalog)
          active_claim: rawClaim ? {
            claim_code: canSeeClaimCode ? rawClaim.claim_code : null,
            status: rawClaim.status,
            claimant_id: rawClaim.claimant_user_id,
            claimant_name: rawClaim.claimant?.name || null,
            claimant_nim: rawClaim.claimant?.nim || null,
          } : null,
        };
      });
      // Hapus array claims mentah dari response publik
      foundItems = foundItems.map(({ claims, ...rest }: any) => rest);
      if (type === 'found') totalCount = count;
    }

    // Filter kondisi lost_reports
    if (type === 'all' || type === 'lost') {
      const whereLost: any = {};
      if (status) {
        whereLost.status = status;
      }
      // Default laporan hilang: tampilkan semua status (active, matched, completed, expired)
      if (category_id) whereLost.category_id = category_id as string;
      if (searchKeyword) {
        whereLost.OR = [
          { title: { contains: searchKeyword, mode: 'insensitive' } },
          { description: { contains: searchKeyword, mode: 'insensitive' } },
          { last_seen_location: { contains: searchKeyword, mode: 'insensitive' } },
        ];
      }

      const [items, count] = await Promise.all([
        prisma.lostReport.findMany({
          where: whereLost,
          select: {
            id: true,
            title: true,
            description: true,
            photo_url: true,
            last_seen_location: true,
            contact: true,
            status: true,
            expires_at: true,
            created_at: true,
            category: { select: { id: true, name: true, slug: true } },
            reporter: {
              select: {
                id: true,
                name: true,
                nim: true,
                prodi: true,
                semester: true,
                kelas: true,
                phone: true,
              },
            },
            // CST-05: Sembunyikan hidden_detail secara ketat
          },
          orderBy: { created_at: 'desc' },
          skip: type === 'lost' ? skipNum : 0,
          take: type === 'lost' ? takeNum : takeNum,
        }),
        prisma.lostReport.count({ where: whereLost }),
      ]);

      lostReports = items.map((i) => ({
        ...i,
        item_type: 'lost',
        // Normalisasi photo_url menjadi URL absolut agar gambar tampil di frontend
        photo_url: buildPhotoUrl(i.photo_url, req),
      }));
      if (type === 'lost') totalCount = count;
    }

    let combinedItems = [];
    if (type === 'all') {
      combinedItems = [...foundItems, ...lostReports].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      totalCount = combinedItems.length;
      combinedItems = combinedItems.slice(skipNum, skipNum + takeNum);
    } else if (type === 'found') {
      combinedItems = foundItems;
    } else {
      combinedItems = lostReports;
    }

    res.status(200).json({
      success: true,
      data: combinedItems,
      pagination: {
        page: pageNum,
        limit: takeNum,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / takeNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Detail Barang Publik (Menyembunyikan hidden_detail kecuali pemilik/admin).
 */
export async function getItemDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type, id } = req.params;
    const currentUserId = req.user?.id;
    const userRole = (req.user?.role || '').toLowerCase();
    const isStaffOrAdmin = userRole === 'admin' || userRole === 'admin_fo' || userRole === 'admin_developer';

    if (type === 'found') {
      const item = await prisma.foundItem.findUnique({
        where: { id },
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
            },
          },
          // Sertakan klaim aktif untuk tampilkan nama pengklaim & kode unik di detail
          claims: {
            where: { status: { in: ['claimed', 'handed_over'] } },
            select: {
              id: true,
              claim_code: true,
              status: true,
              claimed_at: true,
              handed_over_at: true,
              claimant_user_id: true,
              claimant: {
                select: {
                  id: true,
                  name: true,
                  nim: true,
                  prodi: true,
                  semester: true,
                  kelas: true,
                  phone: true,
                },
              },
            },
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      });

      if (!item) {
        throw new AppError('Barang temuan tidak ditemukan.', 404);
      }

      // CST-05: Sembunyikan hidden_detail kecuali pelapor, admin, atau petugas FO
      const isOwnerOrAdmin = currentUserId === item.reporter_id || isStaffOrAdmin;
      const responseData: any = { ...item };
      if (!isOwnerOrAdmin) {
        delete responseData.hidden_detail;
      }

      // Kode unik hanya boleh muncul untuk: user pengklaim, admin FO, dan admin Dev
      const activeClaim = item.claims && item.claims.length > 0 ? item.claims[0] : null;
      const isClaimant = Boolean(currentUserId && activeClaim && (activeClaim.claimant_user_id === currentUserId || activeClaim.claimant?.id === currentUserId));
      const canSeeClaimCode = isStaffOrAdmin || isClaimant;

      const { claims, ...itemWithoutClaims } = responseData;

      res.status(200).json({
        success: true,
        data: {
          ...itemWithoutClaims,
          item_type: 'found',
          // Normalisasi photo_url agar gambar tampil di frontend
          photo_url: buildPhotoUrl(itemWithoutClaims.photo_url, req),
          active_claim: activeClaim ? {
            id: activeClaim.id,
            claim_code: canSeeClaimCode ? activeClaim.claim_code : null,
            status: activeClaim.status,
            claimed_at: activeClaim.claimed_at,
            handed_over_at: activeClaim.handed_over_at,
            claimant_id: activeClaim.claimant_user_id,
            claimant_name: activeClaim.claimant?.name || null,
            claimant_nim: activeClaim.claimant?.nim || null,
            claimant_prodi: activeClaim.claimant?.prodi || null,
            claimant_semester: activeClaim.claimant?.semester || null,
            claimant_kelas: activeClaim.claimant?.kelas || null,
          } : null,
        },
      });
      return;
    }

    if (type === 'lost') {
      const report = await prisma.lostReport.findUnique({
        where: { id },
        include: {
          category: true,
          reporter: {
            select: {
              id: true,
              name: true,
              nim: true,
              prodi: true,
              semester: true,
              kelas: true,
              phone: true,
            },
          },
        },
      });

      if (!report) {
        throw new AppError('Laporan kehilangan tidak ditemukan.', 404);
      }

      const isOwnerOrAdmin = currentUserId === report.reporter_id || isStaffOrAdmin;
      const responseData: any = { ...report };
      if (!isOwnerOrAdmin) {
        delete responseData.hidden_detail;
      }

      res.status(200).json({
        success: true,
        data: {
          ...responseData,
          item_type: 'lost',
          // Normalisasi photo_url agar gambar tampil di frontend
          photo_url: buildPhotoUrl(responseData.photo_url, req),
        },
      });
      return;
    }

    throw new AppError('Tipe barang tidak valid. Harus "found" atau "lost".', 400);
  } catch (error) {
    next(error);
  }
}

/**
 * Pelaporan Barang Temuan (SRS-FR-002 & CST-02).
 */
export async function reportFound(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Anda harus login untuk membuat laporan penemuan barang.', 401);
    }

    const validated = reportFoundSchema.parse(req.body);

    if (!req.file) {
      throw new AppError('Foto barang wajib diunggah (maksimal 2MB)!', 400);
    }

    // Validasi lokasi FO dari master data aktif
    const storageLocation = await prisma.storageLocation.findUnique({
      where: { id: validated.storage_location_id },
    });

    if (!storageLocation || !storageLocation.is_active) {
      throw new AppError(
        'Lokasi Front Office yang dipilih tidak valid atau sedang tidak aktif.',
        400
      );
    }

    const photo_url = `/uploads/${req.file.filename}`;

    // CST-02: storage_status tetap terkunci 'front_office'
    const newItem = await prisma.foundItem.create({
      data: {
        reporter_id: req.user.id,
        category_id: validated.category_id,
        storage_location_id: validated.storage_location_id,
        title: validated.title,
        description: validated.description,
        photo_url,
        location_found: validated.location_found,
        storage_status: 'front_office', // Terkunci sesuai aturan sistem
        validation_question: validated.validation_question,
        hidden_detail: validated.hidden_detail,
        status: 'active',
      },
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
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Laporan barang temuan berhasil dibuat. Harap segera titipkan barang ke loket Front Office terkait.',
      data: {
        ...newItem,
        photo_url: buildPhotoUrl(newItem.photo_url, req),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Pelaporan Barang Hilang & Pembatasan Kuota (SRS-FR-003 & CST-03 & CST-04).
 */
export async function reportLost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Anda harus login untuk membuat laporan kehilangan barang.', 401);
    }

    const validated = reportLostSchema.parse(req.body);

    // CST-03: Periksa dan potong kuota harian (maks 3x per hari kalender)
    const quotaInfo = await checkAndConsumeLostReportQuota(req.user.id);

    // CST-04: Hitung masa kedaluwarsa 7 hari kalender
    const now = new Date();
    const expires_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;

    const newReport = await prisma.lostReport.create({
      data: {
        reporter_id: req.user.id,
        category_id: validated.category_id,
        title: validated.title,
        description: validated.description,
        photo_url,
        last_seen_location: validated.last_seen_location,
        hidden_detail: validated.hidden_detail || null,
        contact: validated.contact,
        status: 'active',
        expires_at,
      },
      include: {
        category: true,
        reporter: {
          select: {
            id: true,
            name: true,
            nim: true,
            prodi: true,
            semester: true,
            kelas: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Laporan kehilangan berhasil dipublikasikan. Laporan akan aktif selama 7 hari kalender.',
      data: {
        report: {
          ...newReport,
          photo_url: buildPhotoUrl(newReport.photo_url, req),
        },
        quota: quotaInfo,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Mengambil riwayat laporan pengguna yang sedang login.
 */
export async function getMyReports(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Anda harus login.', 401);
    }

    const [foundItems, lostReports] = await Promise.all([
      prisma.foundItem.findMany({
        where: { reporter_id: req.user.id },
        include: {
          category: true,
          storage_location: true,
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
                },
              },
            },
            orderBy: { created_at: 'desc' },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.lostReport.findMany({
        where: { reporter_id: req.user.id },
        include: { category: true },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    // Normalisasi photo_url dan tambahkan active_claim info untuk pelapor
    const normalizedFoundItems = foundItems.map((item) => {
      const activeClaim = item.claims.find((c) => c.status === 'claimed' || c.status === 'handed_over') || null;
      return {
        ...item,
        photo_url: buildPhotoUrl(item.photo_url, req),
        active_claim: activeClaim ? {
          id: activeClaim.id,
          claim_code: activeClaim.claim_code,
          status: activeClaim.status,
          claimed_at: activeClaim.claimed_at,
          handed_over_at: activeClaim.handed_over_at,
          claimant_name: activeClaim.claimant?.name || null,
          claimant_nim: activeClaim.claimant?.nim || null,
          claimant_prodi: activeClaim.claimant?.prodi || null,
          claimant_semester: activeClaim.claimant?.semester || null,
          claimant_kelas: activeClaim.claimant?.kelas || null,
          claimant_phone: activeClaim.claimant?.phone || null,
        } : null,
      };
    });

    const normalizedLostReports = lostReports.map((item) => ({
      ...item,
      photo_url: buildPhotoUrl(item.photo_url, req),
    }));

    res.status(200).json({
      success: true,
      data: {
        foundItems: normalizedFoundItems,
        lostReports: normalizedLostReports,
      },
    });
  } catch (error) {
    next(error);
  }
}
