import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import '../config'; // Ensure dotenv is fully loaded before connecting

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

globalForPrisma.prisma = prisma;

/**
 * Memastikan kolom-kolom profil dan role di database PostgreSQL kompatibel
 * untuk menghindari Error 500 saat login User, Admin FO, dan Admin Developer.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  try {
    // 1. Tambah kolom yang diperlukan jika belum ada pada tabel PostgreSQL
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        -- Kolom profil pada tabel users
        ALTER TABLE users ADD COLUMN IF NOT EXISTS nim TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS prodi TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS semester INTEGER;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS kelas TEXT;

        -- Kolom pertanyaan validasi pada found_items
        ALTER TABLE found_items ADD COLUMN IF NOT EXISTS validation_question TEXT DEFAULT 'Sebutkan ciri khusus atau isi dari barang ini!';

        -- Kolom jawaban verifikasi pada claims
        ALTER TABLE claims ADD COLUMN IF NOT EXISTS claimed_answer TEXT;

        -- Hapus check constraint lama pada role jika membatasi nilai role baru
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      END $$;
    `);

    // 2. Pastikan akun default Admin Developer dan Admin FO tersedia di database
    const defaultPasswordHash = await bcrypt.hash('AdminPassword2026!', 10);

    // Admin Developer (admin@kampus.ac.id & dev@kampus.ac.id)
    await prisma.user.upsert({
      where: { email: 'admin@kampus.ac.id' },
      update: { role: 'admin_developer' },
      create: {
        name: 'ADMINISTRATOR DEVELOPER',
        email: 'admin@kampus.ac.id',
        password_hash: defaultPasswordHash,
        role: 'admin_developer',
        phone: '0811-0000-9999',
        nim: 'DEV001',
        prodi: 'Teknik Informatika',
        semester: 8,
        kelas: 'Pagi',
      },
    });

    await prisma.user.upsert({
      where: { email: 'dev@kampus.ac.id' },
      update: { role: 'admin_developer' },
      create: {
        name: 'ADMINISTRATOR DEVELOPER',
        email: 'dev@kampus.ac.id',
        password_hash: defaultPasswordHash,
        role: 'admin_developer',
        phone: '0811-0000-9999',
        nim: 'DEV002',
        prodi: 'Teknik Informatika',
        semester: 8,
        kelas: 'Pagi',
      },
    });

    // Admin FO (fo@kampus.ac.id)
    await prisma.user.upsert({
      where: { email: 'fo@kampus.ac.id' },
      update: { role: 'admin_fo' },
      create: {
        name: 'PETUGAS FRONT OFFICE CKI',
        email: 'fo@kampus.ac.id',
        password_hash: defaultPasswordHash,
        role: 'admin_fo',
        phone: '0811-0000-8888',
        nim: 'FO001',
        prodi: 'Sistem Informasi',
        semester: 6,
        kelas: 'Pagi',
      },
    });
  } catch (err: any) {
    // Log error tapi jangan biarkan crash jika database belum siap
    console.warn('[Database Schema Compatibility Check]:', err.message || err);
  }
}
