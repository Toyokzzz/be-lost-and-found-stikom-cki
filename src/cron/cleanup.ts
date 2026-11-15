import cron from 'node-cron';
import { prisma } from '../utils/prisma';

/**
 * Fungsi inti pembersihan laporan kehilangan yang telah melewati masa aktif 7 hari.
 * Sesuai CST-04 & SRS-FR-004.
 */
export async function runCleanupJob(): Promise<{ expiredCount: number }> {
  console.log(`[Node-Cron Cleanup] [${new Date().toISOString()}] Memulai pemeriksaan laporan kehilangan kedaluwarsa...`);

  const now = new Date();

  try {
    const result = await prisma.lostReport.updateMany({
      where: {
        expires_at: {
          lt: now,
        },
        status: 'active',
      },
      data: {
        status: 'expired',
      },
    });

    console.log(
      `[Node-Cron Cleanup] Berhasil memperbarui ${result.count} laporan kehilangan yang kedaluwarsa menjadi 'expired'.`
    );

    return { expiredCount: result.count };
  } catch (error) {
    console.error('[Node-Cron Cleanup] Terjadi kesalahan saat menjalankan cleanup job:', error);
    throw error;
  }
}

/**
 * Inisialisasi background scheduler dengan zona waktu Asia/Jakarta.
 * Berjalan setiap hari tepat pada pukul 00:00 WIB ("0 0 * * *").
 */
export function initCleanupCronJob() {
  console.log('[Node-Cron] Mengaktifkan penjadwal pembersihan harian (00:00 WIB / Asia/Jakarta)...');

  cron.schedule(
    '0 0 * * *',
    async () => {
      await runCleanupJob();
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );
}
