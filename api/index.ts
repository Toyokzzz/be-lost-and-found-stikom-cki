import { app } from '../src/app';
import { ensureDatabaseSchema } from '../src/utils/prisma';

// Jalankan inisialisasi database di background (tanpa memblokir response HTTP)
let isInitialized = false;
function initDbBackground() {
  if (!isInitialized) {
    isInitialized = true;
    ensureDatabaseSchema().catch((err) => {
      console.warn('[DB Init Background Warn]:', err.message || err);
      // Reset agar bisa dicoba lagi di request berikutnya jika database baru online
      isInitialized = false;
    });
  }
}

// Panggil di background saat container/function cold start
initDbBackground();

// Export default app Express (format resmi yang didukung Vercel Serverless)
export default app;
