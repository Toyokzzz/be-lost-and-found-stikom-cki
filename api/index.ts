import { app } from '../src/app';
import { ensureDatabaseSchema } from '../src/utils/prisma';

let isInitialized = false;

export default async function handler(req: any, res: any) {
  // Selalu tambahkan CORS headers terlebih dahulu,
  // bahkan jika terjadi error di bawah, agar browser tidak memblokir response
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  // Handle preflight OPTIONS langsung tanpa masuk ke Express
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Jalankan migrasi schema dan buat akun admin default saat cold start pertama
  if (!isInitialized) {
    try {
      await ensureDatabaseSchema();
      isInitialized = true;
    } catch (error) {
      console.error('Error saat inisialisasi skema database:', error);
      // Tetap lanjutkan agar API route lain masih bisa diakses
    }
  }

  return app(req, res);
}
