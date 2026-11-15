import { app } from '../src/app';
import { ensureDatabaseSchema } from '../src/utils/prisma';

let isInitialized = false;

export default async function handler(req: any, res: any) {
  // ── CORS Headers ── Selalu kirim, bahkan saat error ──
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  // ── Handle preflight OPTIONS langsung ──
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Inisialisasi schema database dan akun admin default (hanya sekali)
    if (!isInitialized) {
      try {
        await ensureDatabaseSchema();
        isInitialized = true;
      } catch (dbError) {
        console.error('[Vercel Handler] Database initialization error (non-fatal):', dbError);
        // Jangan crash — tetap lanjutkan agar route lain bisa diakses
      }
    }

    // Teruskan ke Express app
    return app(req, res);
  } catch (error) {
    console.error('[Vercel Handler] Unhandled error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error pada serverless function.',
    });
  }
}
