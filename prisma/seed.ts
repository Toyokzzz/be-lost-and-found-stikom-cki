import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Memulai Seeding Database Lost & Found Kampus ---');

  // 1. Seed Master Categories
  const categoriesData = [
    { name: 'Elektronik & Gadget', slug: 'elektronik' },
    { name: 'Dokumen & Kartu Identitas', slug: 'dokumen-kartu' },
    { name: 'Dompet & Tas', slug: 'dompet-tas' },
    { name: 'Kunci & Aksesoris Kunci', slug: 'kunci' },
    { name: 'Pakaian & Jaket', slug: 'pakaian' },
    { name: 'Aksesoris & Perhiasan', slug: 'aksesoris' },
    { name: 'Alat Tulis & Buku Catatan', slug: 'alat-tulis' },
    { name: 'Barang Lainnya', slug: 'lainnya' },
  ];

  for (const cat of categoriesData) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: cat,
    });
  }
  console.log('✓ Master Kategori berhasil diisi (8 kategori)');

  // 2. Seed Master Front Office Storage Locations (CST-01 & CST-02)
  const locationsData = [
    {
      name: 'Front Office Gedung Rektorat',
      building: 'Gedung Rektorat (Lantai 1)',
      service_hours: 'Senin - Jumat: 08:00 - 16:00 WIB',
      contact: '0812-9988-7711 (FO Rektorat)',
      is_active: true,
    },
    {
      name: 'Pos Security Gerbang Utama',
      building: 'Gerbang Masuk Utama Kampus',
      service_hours: 'Setiap Hari: 24 Jam Layanan',
      contact: '0812-9988-7722 (Posko Keamanan)',
      is_active: true,
    },
    {
      name: 'Front Office Gedung Perkuliahan Terpadu',
      building: 'Gedung A (Lobi Lantai Dasar)',
      service_hours: 'Senin - Sabtu: 07:30 - 17:00 WIB',
      contact: '0812-9988-7733 (FO Gedung A)',
      is_active: true,
    },
    {
      name: 'Layanan Front Office Perpustakaan',
      building: 'Perpustakaan Pusat (Lantai 2)',
      service_hours: 'Senin - Jumat: 08:30 - 15:30 WIB',
      contact: '0812-9988-7744 (Sirkulasi Perpus)',
      is_active: true,
    },
  ];

  for (const loc of locationsData) {
    const existing = await prisma.storageLocation.findFirst({
      where: { name: loc.name },
    });
    if (!existing) {
      await prisma.storageLocation.create({ data: loc });
    }
  }
  console.log('✓ Master Lokasi Front Office berhasil diisi (4 lokasi aktif)');

  // 3. Seed Admin Accounts (Admin Developer & Admin Front Office)
  const defaultPasswordHash = await bcrypt.hash('AdminPassword2026!', 10);
  
  // Admin Developer
  const adminDev = await prisma.user.upsert({
    where: { email: 'admin@kampus.ac.id' },
    update: {
      password_hash: defaultPasswordHash,
      role: 'admin_developer',
      nim: 'DEV001',
      prodi: 'Teknik Informatika',
      semester: 8,
      kelas: 'Pagi',
    },
    create: {
      name: 'Administrator Developer',
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
  console.log(`✓ Akun Admin Developer siap: ${adminDev.email}`);

  // Admin Front Office (FO)
  const adminFO = await prisma.user.upsert({
    where: { email: 'fo@kampus.ac.id' },
    update: {
      password_hash: defaultPasswordHash,
      role: 'admin_fo',
      nim: 'FO001',
      prodi: 'Sistem Informasi',
      semester: 6,
      kelas: 'Pagi',
    },
    create: {
      name: 'Petugas Front Office CKI',
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
  console.log(`✓ Akun Admin Front Office siap: ${adminFO.email}`);

  // Mahasiswa Contoh
  const mhsPasswordHash = await bcrypt.hash('MahasiswaPassword2026!', 10);
  const mhsUser = await prisma.user.upsert({
    where: { email: 'mahasiswa@stikomcki.ac.id' },
    update: {
      password_hash: mhsPasswordHash,
      name: 'DIMAS PRASETYO',
      role: 'mahasiswa',
      nim: '2024010101',
      prodi: 'Teknik Informatika',
      semester: 5,
      kelas: 'Pagi',
      phone: '0812-3456-7890',
    },
    create: {
      name: 'DIMAS PRASETYO',
      email: 'mahasiswa@stikomcki.ac.id',
      password_hash: mhsPasswordHash,
      role: 'mahasiswa',
      nim: '2024010101',
      prodi: 'Teknik Informatika',
      semester: 5,
      kelas: 'Pagi',
      phone: '0812-3456-7890',
    },
  });
  console.log(`✓ Akun Mahasiswa Contoh siap: ${mhsUser.email}`);

  // 5. Seed Initial Sample Found & Lost Items (untuk pengujian instan katalog)
  const catElektronik = await prisma.category.findUnique({ where: { slug: 'elektronik' } });
  const catDompet = await prisma.category.findUnique({ where: { slug: 'dompet-tas' } });
  const locRektorat = await prisma.storageLocation.findFirst({ where: { name: 'Front Office Gedung Rektorat' } });

  if (catElektronik && locRektorat) {
    const existingItem = await prisma.foundItem.findFirst({
      where: { title: 'Earphone TWS Hitam Case Bulat' },
    });
    if (!existingItem) {
      await prisma.foundItem.create({
        data: {
          reporter_id: mhsUser.id,
          category_id: catElektronik.id,
          storage_location_id: locRektorat.id,
          title: 'Earphone TWS Hitam Case Bulat',
          description: 'Ditemukan di meja kantin belakang dekat dispenser air. Masih berfungsi dan baterai penuh.',
          photo_url: '/uploads/sample-tws.jpg',
          location_found: 'Kantin Belakang Kampus',
          storage_status: 'front_office',
          validation_question: 'Apa ciri khusus atau stiker di bagian bawah docking charger barang ini?',
          hidden_detail: 'Stiker logo apel mini warna silver di bagian bawah docking charger',
          status: 'active',
        },
      });
      console.log('✓ Sample Found Item berhasil dibuat');
    }
  }

  if (catDompet) {
    const existingLost = await prisma.lostReport.findFirst({
      where: { title: 'Dompet Kulit Cokelat Merk Cardinal' },
    });
    if (!existingLost) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.lostReport.create({
        data: {
          reporter_id: mhsUser.id,
          category_id: catDompet.id,
          title: 'Dompet Kulit Cokelat Merk Cardinal',
          description: 'Hilang sekitar area Lab Komputer 3 atau Musholla Lantai 2. Berisi KTM dan SIM A.',
          last_seen_location: 'Lab Komputer 3 Lantai 2',
          hidden_detail: 'Foto pasfoto ukuran 3x4 berlatar merah di balik slot kartu kedua',
          contact: '0812-3456-7890 (Tyo via WA)',
          status: 'active',
          expires_at: expiresAt,
        },
      });
      console.log('✓ Sample Lost Report berhasil dibuat');
    }
  }

  console.log('--- Seeding Selesai dengan Sukses ---');
}

main()
  .catch((e) => {
    console.error('Error saat seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
