import { prisma } from '../utils/prisma';
import { AppError } from '../middlewares/errorHandler';
import { verifyHiddenDetail } from '../utils/textNormalizer';
import { generateClaimCode } from '../utils/claimCodeGenerator';
import {
  checkClaimAttemptStatus,
  recordFailedAttempt,
  recordSuccessfulClaim,
} from './claimAttempt.service';

/**
 * Memproses verifikasi mandiri klaim barang temuan.
 * Sesuai CST-05, CST-06, SRS-FR-005.
 */
export async function verifyAndCreateClaim(
  foundItemId: string,
  claimantUserId: string,
  claimedAnswer: string,
  lostReportId?: string
) {
  const item = await prisma.foundItem.findUnique({
    where: { id: foundItemId },
    include: { storage_location: true },
  });

  if (!item) {
    throw new AppError('Barang temuan tidak ditemukan.', 404);
  }

  if (item.status !== 'active') {
    throw new AppError(
      `Barang ini saat ini tidak dapat diklaim karena berstatus "${item.status}".`,
      400
    );
  }

  if (item.reporter_id === claimantUserId) {
    throw new AppError('Anda tidak dapat mengklaim barang yang Anda laporkan sendiri.', 400);
  }

  // Periksa apakah pengguna ini sudah memiliki klaim berstatus active/claimed pada item ini
  const existingClaim = await prisma.claim.findFirst({
    where: {
      found_item_id: foundItemId,
      claimant_user_id: claimantUserId,
      status: 'claimed',
    },
  });

  if (existingClaim) {
    return {
      claim: existingClaim,
      alreadyClaimed: true,
      message: 'Anda sudah berhasil mengklaim barang ini sebelumnya. Tunjukkan Claim Code Anda ke petugas loket.',
    };
  }

  // Periksa batas percobaan (maksimal 3 kali, jeda 60 menit jika 3 kali salah)
  const attemptStatus = checkClaimAttemptStatus(claimantUserId, foundItemId);
  if (!attemptStatus.allowed) {
    throw new AppError(
      `Percobaan menjawab pertanyaan validasi telah mencapai batas maksimal (3 kali). Sistem memberikan waktu jeda selama 60 menit. Silakan coba lagi dalam ${attemptStatus.lockedMinutesRemaining || 60} menit.`,
      429
    );
  }

  // Verifikasi kecocokan ciri rahasia (hidden detail)
  const isMatch = verifyHiddenDetail(item.hidden_detail, claimedAnswer);

  if (!isMatch) {
    const failResult = recordFailedAttempt(claimantUserId, foundItemId);
    if (failResult.isLocked) {
      throw new AppError(
        'Percobaan menjawab pertanyaan validasi telah salah sebanyak 3 kali. Sistem memberikan waktu jeda selama 60 menit sebelum Anda dapat mencoba kembali.',
        429
      );
    }
    throw new AppError(
      `Jawaban validasi yang Anda berikan belum sesuai dengan catatan penemuan barang. Kesempatan tersisa: ${failResult.remainingAttempts} kali.`,
      400
    );
  }

  // Jawaban cocok! Reset percobaan salah untuk user dan barang ini
  recordSuccessfulClaim(claimantUserId, foundItemId);

  // Hasilkan Claim Code 6-karakter acak unik
  let claimCode = generateClaimCode();
  // Pastikan unik di DB
  let isCodeUnique = false;
  while (!isCodeUnique) {
    const foundCode = await prisma.claim.findUnique({ where: { claim_code: claimCode } });
    if (!foundCode) {
      isCodeUnique = true;
    } else {
      claimCode = generateClaimCode();
    }
  }

  // Eksekusi transaksi atomik: ubah status barang jadi 'claimed' dan buat record claim baru
  const result = await prisma.$transaction(async (tx) => {
    const updatedItem = await tx.foundItem.update({
      where: { id: foundItemId },
      data: { status: 'claimed' },
    });

    const newClaim = await tx.claim.create({
      data: {
        found_item_id: foundItemId,
        claimant_user_id: claimantUserId,
        lost_report_id: lostReportId || null,
        claim_code: claimCode,
        claimed_answer: claimedAnswer,
        status: 'claimed',
        attempt_count: 1,
      },
      include: {
        found_item: {
          include: { storage_location: true, category: true },
        },
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
    });

    return { updatedItem, newClaim };
  });

  return {
    claim: result.newClaim,
    alreadyClaimed: false,
    message: 'Verifikasi ciri rahasia BERHASIL! Simpan Claim Code Anda dan tunjukkan ke loket Front Office.',
  };
}

/**
 * Menandai "Barang Sudah Diterima" secara fisik oleh pemilik / pengklaim barang.
 * Sesuai CST-07 & SRS-FR-006.
 * Pemangku yang bisa mengkonfirmasi:
 * - Pengklaim barang (claimant)
 * - Admin / Admin FO (sebagai override wewenang jika diperlukan)
 */
export async function completePhysicalHandover(claimId: string, userId: string, isAdmin = false) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { found_item: true },
  });

  if (!claim) {
    throw new AppError('Klaim tidak ditemukan.', 404);
  }

  // Izinkan hanya pengklaim barang atau admin
  const isClaimant = claim.claimant_user_id === userId;

  if (!isAdmin && !isClaimant) {
    throw new AppError('Anda tidak memiliki wewenang untuk menyelesaikan klaim ini. Hanya pengklaim atau admin yang dapat mengonfirmasi.', 403);
  }

  // Idempotent: jika klaim sudah diselesaikan sebelumnya, kembalikan data langsung
  if (claim.status === 'handed_over') {
    return claim;
  }

  const now = new Date();

  // Eksekusi transaksi atomik
  const updatedClaim = await prisma.$transaction(async (tx) => {
    // 1. Update claims
    const c = await tx.claim.update({
      where: { id: claimId },
      data: {
        status: 'handed_over',
        handed_over_at: now,
      },
    });

    // 2. Update found_items status jadi 'completed'
    await tx.foundItem.update({
      where: { id: claim.found_item_id },
      data: { status: 'completed' },
    });

    // 3. Jika ada lost_report terkait, ubah jadi 'completed'
    if (claim.lost_report_id) {
      await tx.lostReport.update({
        where: { id: claim.lost_report_id },
        data: { status: 'completed' },
      });
    }

    return c;
  });

  return updatedClaim;
}
