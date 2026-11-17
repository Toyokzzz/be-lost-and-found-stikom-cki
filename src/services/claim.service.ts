import { prisma } from '../utils/prisma';
import { AppError } from '../middlewares/errorHandler';
import { verifyHiddenDetail } from '../utils/textNormalizer';
import { generateClaimCode } from '../utils/claimCodeGenerator';

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

  // Verifikasi kecocokan ciri rahasia (hidden detail)
  const isMatch = verifyHiddenDetail(item.hidden_detail, claimedAnswer);

  if (!isMatch) {
    throw new AppError(
      'Ciri rahasia yang Anda berikan belum sesuai dengan catatan penemuan barang. Pastikan deskripsi ciri fisik rahasia spesifik dan akurat.',
      400
    );
  }

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
 * Menandai "Barang Sudah Diterima" secara fisik oleh pemilik atau pelapor penemu.
 * Sesuai CST-07 & SRS-FR-006.
 * Pemangku yang bisa mengkonfirmasi:
 * - Pengklaim barang (claimant)
 * - Pelapor penemu barang (reporter) — perubahan: tombol pindah dari admin FO ke user pelapor
 * - Admin / Admin FO
 */
export async function completePhysicalHandover(claimId: string, userId: string, isAdmin = false) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { found_item: true },
  });

  if (!claim) {
    throw new AppError('Klaim tidak ditemukan.', 404);
  }

  // Izinkan: pengklaim, pelapor penemu, atau admin
  const isClaimant = claim.claimant_user_id === userId;
  const isReporter = claim.found_item.reporter_id === userId;

  if (!isAdmin && !isClaimant && !isReporter) {
    throw new AppError('Anda tidak memiliki wewenang untuk menyelesaikan klaim ini.', 403);
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
