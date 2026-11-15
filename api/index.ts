import { app } from '../src/app';
import { ensureDatabaseSchema } from '../src/utils/prisma';

let isInitialized = false;

export default async function handler(req: any, res: any) {
  // Jalankan migrasi schema dan buat akun admin default saat cold start pertama
  if (!isInitialized) {
    try {
      await ensureDatabaseSchema();
      isInitialized = true;
    } catch (error) {
      console.error('Error saat inisialisasi skema database:', error);
    }
  }

  return app(req, res);
}
