import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { AppError } from '../middlewares/errorHandler';
import { getLostReportQuotaStatus } from '../services/quota.service';

/**
 * Mengembalikan konfigurasi Google Client ID yang aktif pada backend
 * sehingga frontend selalu tersinkronisasi 100% dengan Client ID resmi.
 */
export async function getGoogleConfig(_req: Request, res: Response): Promise<void> {
  const clientId = config.googleClientId || '';
  res.status(200).json({
    success: true,
    data: {
      clientId,
      isConfigured: Boolean(clientId && clientId.trim().length > 10 && !clientId.includes('your_')),
    },
  });
}

/**
 * Validasi apakah profil pengguna sudah lengkap.
 * Admin (Admin FO, Admin Developer, Super Admin) secara otomatis dianggap lengkap.
 */
export function isProfileComplete(user: {
  name?: string | null;
  phone?: string | null;
  user_type?: string | null;
  jabatan?: string | null;
  nim?: string | null;
  prodi?: string | null;
  semester?: number | null;
  kelas?: string | null;
  role?: string | null;
}): boolean {
  if (!user) return false;

  const role = (user.role || '').toLowerCase();
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  const phone = typeof user.phone === 'string' ? user.phone.trim() : '';

  // 1. Admin FO: hanya nama lengkap yang wajib diisi
  if (role === 'admin_fo') {
    return Boolean(name.length > 0);
  }

  // 2. Admin Developer: hanya nama lengkap dan no whatsapp yang wajib diisi
  if (role === 'admin' || role === 'admin_developer') {
    return Boolean(name.length > 0 && phone.length > 0);
  }

  // 3. Regular User (civitas kampus):
  const userType = user.user_type || 'Mahasiswa';

  if (userType === 'Dosen' || userType === 'Pegawai') {
    // Dosen / Pegawai: nama lengkap, jabatan / posisi, nomor whatsapp wajib diisi
    const jabatan = typeof user.jabatan === 'string' ? user.jabatan.trim() : '';
    return Boolean(name.length > 0 && jabatan.length > 0 && phone.length > 0);
  }

  // Mahasiswa: nama lengkap, NIM, prodi, semester, kelas wajib diisi
  const nim = user.nim ? String(user.nim).trim() : '';
  const prodi = typeof user.prodi === 'string' ? user.prodi.trim() : '';
  const semester = Number(user.semester);
  const kelas = typeof user.kelas === 'string' ? user.kelas.trim() : '';

  return Boolean(
    name.length > 0 &&
    nim.length > 0 &&
    prodi.length > 0 &&
    semester >= 1 &&
    semester <= 8 &&
    (kelas === 'Pagi' || kelas === 'Malam')
  );
}

const registerSchema = z.object({
  name: z.string().min(3, 'Nama minimal 3 karakter').max(100),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  phone: z.string().optional(),
  nim: z.string().optional(),
  prodi: z.string().optional(),
  semester: z.number().int().min(1).max(8).optional(),
  kelas: z.enum(['Pagi', 'Malam']).optional(),
});

// Mendukung login via Email maupun ID / NIM resmi
const loginSchema = z
  .object({
    identifier: z.string().optional(),
    email: z.string().optional(),
    password: z.string().min(1, 'Password wajib diisi'),
  })
  .refine(
    (data) => Boolean((data.identifier && data.identifier.trim()) || (data.email && data.email.trim())),
    {
      message: 'Email atau ID Pengguna wajib diisi',
      path: ['email'],
    }
  );

const updateProfileSchema = z.object({
  name: z.string().min(3, 'Nama Lengkap minimal 3 karakter').max(100),
  user_type: z.enum(['Mahasiswa', 'Dosen', 'Pegawai']).optional(),
  jabatan: z.string().optional(),
  nim: z.string().optional(),
  prodi: z.string().optional(),
  semester: z.number().int().min(1).max(8).optional(),
  kelas: z.enum(['Pagi', 'Malam']).optional(),
  phone: z.string().optional(),
});

const googleAuthSchema = z
  .object({
    credential: z.string().optional(), // Google ID Token (GIS JWT)
    access_token: z.string().optional(), // Google OAuth 2.0 Access Token
    token: z.string().optional(), // Generic token
    email: z.string().email('Email Google tidak valid').optional(),
    name: z.string().min(2, 'Nama minimal 2 karakter').optional(),
    role: z.string().optional(),
  })
  .refine(
    (data) => Boolean((data.email && data.email.trim()) || data.credential || data.access_token || data.token),
    {
      message: 'Kredensial token Google OAuth (credential, access_token, atau id_token) wajib disertakan.',
      path: ['credential'],
    }
  );

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });

    if (existingUser) {
      throw new AppError('Email sudah terdaftar. Silakan login atau gunakan email lain.', 400);
    }

    if (validated.nim) {
      const existingNim = await prisma.user.findUnique({
        where: { nim: String(validated.nim).trim() },
      });
      if (existingNim) {
        throw new AppError('NIM sudah terdaftar. Periksa kembali NIM Anda.', 400);
      }
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(validated.password, salt);

    // Otomatis Kapital (Caps Lock) sesuai Aturan Bisnis Modul Profil
    const formattedName = validated.name.trim().toUpperCase();

    // CST-10: Pendaftaran publik default role 'mahasiswa'
    const newUser = await prisma.user.create({
      data: {
        name: formattedName,
        email: validated.email.toLowerCase(),
        password_hash,
        role: 'mahasiswa',
        phone: validated.phone || null,
        nim: validated.nim ? String(validated.nim).trim() : null,
        prodi: validated.prodi ? validated.prodi.trim() : null,
        semester: validated.semester || null,
        kelas: validated.kelas || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        nim: true,
        prodi: true,
        semester: true,
        kelas: true,
        created_at: true,
      },
    });

    const token = jwt.sign(
      { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil! Selamat datang di Lost & Found Kampus.',
      data: {
        user: {
          ...newUser,
          isProfileComplete: isProfileComplete(newUser),
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Login Manual Standar: Wajib mengetikkan Email/ID dan Kata Sandi.
 * Mendukung autentikasi seluruh peran: Mahasiswa, Admin FO, dan Admin Developer.
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = loginSchema.parse(req.body);
    const idInput = (validated.identifier || validated.email || '').trim();
    const isEmail = idInput.includes('@');

    // Pencarian user berdasarkan Email ATAU NIM/ID Admin
    let user = await prisma.user.findFirst({
      where: isEmail
        ? { email: idInput.toLowerCase() }
        : {
            OR: [
              { nim: idInput },
              { nim: idInput.toUpperCase() },
              { email: idInput.toLowerCase() },
            ],
          },
    });

    // Auto-provisioning akun admin resmi jika belum ada di database
    if (!user) {
      const lowerInput = idInput.toLowerCase();
      if (lowerInput === 'admin@kampus.ac.id' || lowerInput === 'dev@kampus.ac.id' || idInput.toUpperCase() === 'DEV001' || idInput.toUpperCase() === 'DEV002') {
        const defaultPasswordHash = await bcrypt.hash(config.adminDefaultPassword, 10);
        user = await prisma.user.create({
          data: {
            name: 'ADMINISTRATOR DEVELOPER',
            email: lowerInput.includes('@') ? lowerInput : 'admin@kampus.ac.id',
            password_hash: defaultPasswordHash,
            role: 'admin_developer',
            nim: 'DEV001',
            prodi: 'Teknik Informatika',
            semester: 8,
            kelas: 'Pagi',
          },
        });
      } else if (lowerInput === 'fo@kampus.ac.id' || idInput.toUpperCase() === 'FO001') {
        const defaultPasswordHash = await bcrypt.hash(config.adminDefaultPassword, 10);
        user = await prisma.user.create({
          data: {
            name: 'PETUGAS FRONT OFFICE CKI',
            email: lowerInput.includes('@') ? lowerInput : 'fo@kampus.ac.id',
            password_hash: defaultPasswordHash,
            role: 'admin_fo',
            nim: 'FO001',
            prodi: 'Sistem Informasi',
            semester: 6,
            kelas: 'Pagi',
          },
        });
      }
    }

    if (!user || !user.password_hash) {
      throw new AppError('Email/ID atau kata sandi yang Anda masukkan salah.', 401);
    }

    // Validasi kata sandi wajib dengan bcrypt
    const isMatch = await bcrypt.compare(validated.password, user.password_hash);
    if (!isMatch) {
      throw new AppError('Email/ID atau kata sandi yang Anda masukkan salah.', 401);
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    res.status(200).json({
      success: true,
      message: 'Login berhasil.',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          user_type: user.user_type,
          jabatan: user.jabatan,
          phone: user.phone,
          nim: user.nim,
          prodi: user.prodi,
          semester: user.semester,
          kelas: user.kelas,
          isProfileComplete: isProfileComplete(user),
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Autentikasi Google OAuth Khusus Civitas Mahasiswa.
 * Dilarang keras melakukan bypass hak akses Administrator (Admin FO & Admin Dev) tanpa password.
 */
export async function googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = googleAuthSchema.parse(req.body);
    let extractedEmail = '';
    let extractedName = '';

    const rawToken = validated.credential || validated.token;
    const rawAccessToken = validated.access_token;

    // 1. Verifikasi wajib melalui Google Userinfo API resmi jika access_token disertakan
    if (rawAccessToken) {
      try {
        const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${rawAccessToken}` },
        });
        if (googleRes.ok) {
          const googleProfile: any = await googleRes.json();
          if (googleProfile.email) {
            extractedEmail = String(googleProfile.email).trim().toLowerCase();
            extractedName = String(googleProfile.name || googleProfile.email.split('@')[0]).trim();
          }
        } else {
          console.warn('[Google Auth]: Userinfo API merespon status error:', googleRes.status);
        }
      } catch (fetchErr) {
        console.warn('[Google Auth]: Gagal menghubungi userinfo Google API:', fetchErr);
      }
    }

    // 2. Verifikasi wajib melalui Google Tokeninfo API resmi (ID Token / Credential)
    if (!extractedEmail && rawToken) {
      try {
        const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(rawToken)}`);
        if (tokenInfoRes.ok) {
          const tokenInfo: any = await tokenInfoRes.json();
          // Validasi aud (audience) agar token memang ditujukan untuk aplikasi ini jika Client ID dikonfigurasi
          if (config.googleClientId && tokenInfo.aud && tokenInfo.aud !== config.googleClientId) {
            throw new AppError('Token Google tidak valid: Audience (Client ID) tidak cocok dengan server.', 401);
          }
          if (tokenInfo.email) {
            extractedEmail = String(tokenInfo.email).trim().toLowerCase();
            extractedName = String(tokenInfo.name || tokenInfo.email.split('@')[0]).trim();
          }
        } else {
          console.warn('[Google Auth]: Tokeninfo API merespon status error:', tokenInfoRes.status);
        }
      } catch (tokenInfoErr: any) {
        if (tokenInfoErr instanceof AppError) throw tokenInfoErr;
        console.warn('[Google Auth]: Gagal menghubungi tokeninfo Google API:', tokenInfoErr);
      }
    }

    // KEAMANAN KETAT (SEC-01): Dilarang melakukan decode payload JWT lokal tanpa verifikasi signature upstream!
    // Kredensial akun Google HARUS berhasil diverifikasi oleh server Google secara upstream
    if (!extractedEmail || !extractedEmail.includes('@')) {
      throw new AppError(
        'Autentikasi Google gagal: Kredensial akun Google tidak valid atau signature token tidak dapat diverifikasi oleh server Google.',
        401
      );
    }

    if (!extractedName) {
      extractedName = extractedEmail.split('@')[0];
    }

    // KEAMANAN KETAT: Blokir bypass akun administrator tanpa password manual
    const requestedRole = (validated.role || '').toLowerCase();
    if (
      requestedRole === 'admin' ||
      requestedRole === 'admin_fo' ||
      requestedRole === 'admin_developer' ||
      extractedEmail.includes('admin@') ||
      extractedEmail.includes('fo@') ||
      extractedEmail.includes('dev@')
    ) {
      throw new AppError(
        'Akses ditolak. Akun Administrator (Admin FO & Admin Developer) wajib login menggunakan form login manual dengan Email/ID dan kata sandi resmi.',
        403
      );
    }

    let user = await prisma.user.findUnique({
      where: { email: extractedEmail },
    });

    if (user) {
      const userRole = (user.role || '').toLowerCase();
      if (userRole === 'admin' || userRole === 'admin_fo' || userRole === 'admin_developer') {
        throw new AppError(
          'Akun Administrator wajib login menggunakan kredensial kata sandi pada form login standar.',
          403
        );
      }
    } else {
      // User baru via Google selalu memiliki role 'mahasiswa'
      const formattedName = extractedName.trim().toUpperCase();
      const randomPassword = `OAuth_${Math.random().toString(36).substring(2)}_${Date.now()}`;
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(randomPassword, salt);

      user = await prisma.user.create({
        data: {
          name: formattedName,
          email: extractedEmail,
          password_hash,
          role: 'mahasiswa',
        },
      });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    res.status(200).json({
      success: true,
      message: 'Autentikasi Google OAuth berhasil.',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          user_type: user.user_type,
          jabatan: user.jabatan,
          phone: user.phone,
          nim: user.nim,
          prodi: user.prodi,
          semester: user.semester,
          kelas: user.kelas,
          isProfileComplete: isProfileComplete(user),
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update Data Profil Pengguna (SRS & User Request: Modul Profil Sesuai Peran Civitas).
 */
export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Tidak terautentikasi.', 401);
    }

    const validated = updateProfileSchema.parse(req.body);
    const role = (req.user.role || '').toLowerCase();
    const formattedName = validated.name.trim().toUpperCase();

    let user_type = validated.user_type || 'Mahasiswa';
    let jabatan = validated.jabatan ? validated.jabatan.trim() : null;
    let phone = validated.phone ? validated.phone.trim() : null;
    let nim = validated.nim ? String(validated.nim).trim() : null;
    let prodi = validated.prodi ? validated.prodi.trim() : null;
    let semester = validated.semester || null;
    let kelas = validated.kelas || null;

    // Validasi berdasarkan role dan user_type
    if (role === 'admin_fo') {
      // Admin FO: hanya nama lengkap yang wajib diisi
    } else if (role === 'admin' || role === 'admin_developer') {
      // Admin Dev: nama lengkap dan no whatsapp wajib diisi
      if (!phone) {
        throw new AppError('Nomor WhatsApp wajib diisi untuk Administrator.', 400);
      }
    } else {
      // Regular user civitas
      if (user_type === 'Dosen' || user_type === 'Pegawai') {
        if (!jabatan) {
          throw new AppError('Jabatan / Posisi wajib diisi untuk Dosen / Pegawai.', 400);
        }
        if (!phone) {
          throw new AppError('Nomor WhatsApp wajib diisi untuk Dosen / Pegawai.', 400);
        }
      } else {
        // Mahasiswa: nama, nim, prodi, semester, kelas wajib
        user_type = 'Mahasiswa';
        if (!nim) {
          throw new AppError('NIM wajib diisi untuk Mahasiswa.', 400);
        }
        if (!prodi) {
          throw new AppError('Program Studi wajib dipilih.', 400);
        }
        const allowedProdi = ['Teknik Informatika', 'Sistem Informasi', 'Bisnis Digital'];
        if (!allowedProdi.includes(prodi)) {
          throw new AppError('Program Studi harus salah satu dari: Teknik Informatika, Sistem Informasi, atau Bisnis Digital.', 400);
        }
        if (!semester || semester < 1 || semester > 8) {
          throw new AppError('Semester harus antara 1 sampai 8.', 400);
        }
        if (!kelas || (kelas !== 'Pagi' && kelas !== 'Malam')) {
          throw new AppError('Pilihan kelas harus "Pagi" atau "Malam".', 400);
        }
      }
    }

    // Periksa apakah NIM sudah digunakan pengguna lain jika nim diisi
    if (nim) {
      const existingNim = await prisma.user.findFirst({
        where: {
          nim,
          NOT: { id: req.user.id },
        },
      });

      if (existingNim) {
        throw new AppError('NIM ini sudah terdaftar oleh pengguna lain.', 400);
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: formattedName,
        user_type,
        jabatan,
        nim,
        prodi,
        semester,
        kelas,
        phone,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        user_type: true,
        jabatan: true,
        phone: true,
        nim: true,
        prodi: true,
        semester: true,
        kelas: true,
        created_at: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Profil berhasil diperbarui dan disimpan lengkap.',
      data: {
        user: {
          ...updatedUser,
          isProfileComplete: isProfileComplete(updatedUser),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Tidak terautentikasi.', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        user_type: true,
        jabatan: true,
        phone: true,
        nim: true,
        prodi: true,
        semester: true,
        kelas: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.', 404);
    }

    let quota = null;
    try {
      quota = await getLostReportQuotaStatus(user.id);
    } catch {
      quota = {
        dailyCount: 0,
        maxLimit: 3,
        remainingQuota: 3,
        resetAt: new Date().toISOString(),
      };
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          ...user,
          isProfileComplete: isProfileComplete(user),
        },
        quota,
      },
    });
  } catch (error) {
    next(error);
  }
}
