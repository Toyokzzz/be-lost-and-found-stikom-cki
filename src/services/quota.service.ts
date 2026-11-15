import { prisma } from '../utils/prisma';
import { AppError } from '../middlewares/errorHandler';

export class QuotaExceededError extends AppError {
  resetTime: string;
  remainingMs: number;

  constructor(message: string, resetTime: string, remainingMs: number) {
    super(message, 429); // HTTP 429 Too Many Requests
    this.resetTime = resetTime;
    this.remainingMs = remainingMs;
    Object.setPrototypeOf(this, QuotaExceededError.prototype);
  }
}

/**
 * Mendapatkan representasi string tanggal hari ini (YYYY-MM-DD) berdasarkan zona waktu WIB (Asia/Jakarta).
 */
export function getWIBDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Menghitung waktu reset (tengah malam berikutnya WIB) dan sisa waktu dalam milidetik.
 */
export function calculateWIBResetInfo(): { resetDateStr: string; remainingMs: number } {
  const now = new Date();
  const wibTodayStr = getWIBDateString(now);

  // Buat objek tanggal untuk besok tengah malam WIB (UTC+7)
  const tomorrowMidnightWIB = new Date(`${wibTodayStr}T23:59:59.999+07:00`);
  const remainingMs = Math.max(0, tomorrowMidnightWIB.getTime() - now.getTime());

  return {
    resetDateStr: tomorrowMidnightWIB.toISOString(),
    remainingMs,
  };
}

/**
 * Memeriksa kuota pelaporan kehilangan pengguna (Maksimal 3 per hari).
 * Mengembalikan data status kuota atau melempar QuotaExceededError (HTTP 429).
 */
export async function checkAndConsumeLostReportQuota(userId: string): Promise<{
  currentCount: number;
  remainingQuota: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      daily_report_count: true,
      daily_report_date: true,
    },
  });

  if (!user) {
    throw new AppError('Pengguna tidak ditemukan.', 404);
  }

  const todayStr = getWIBDateString();
  const userDateStr = user.daily_report_date ? getWIBDateString(user.daily_report_date) : '';

  let currentCount = user.daily_report_count;

  // Jika hari berganti (berbeda tanggal WIB), reset kuota ke 0
  if (userDateStr !== todayStr) {
    currentCount = 0;
  }

  const MAX_DAILY_REPORTS = 3;

  if (currentCount >= MAX_DAILY_REPORTS) {
    const { resetDateStr, remainingMs } = calculateWIBResetInfo();
    const hoursRemaining = Math.ceil(remainingMs / (1000 * 60 * 60));
    throw new QuotaExceededError(
      `Batas kuota pelaporan kehilangan harian tercapai (Maksimal 3 laporan per hari). Kuota Anda akan di-reset dalam sekitar ${hoursRemaining} jam (tengah malam WIB).`,
      resetDateStr,
      remainingMs
    );
  }

  // Increment kuota
  const newCount = currentCount + 1;
  await prisma.user.update({
    where: { id: userId },
    data: {
      daily_report_count: newCount,
      daily_report_date: new Date(),
    },
  });

  return {
    currentCount: newCount,
    remainingQuota: MAX_DAILY_REPORTS - newCount,
  };
}

/**
 * Ambil status sisa kuota hari ini tanpa melakukan konsumsi (read-only).
 */
export async function getLostReportQuotaStatus(userId: string): Promise<{
  dailyCount: number;
  maxLimit: number;
  remainingQuota: number;
  resetAt: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { daily_report_count: true, daily_report_date: true },
  });

  if (!user) {
    throw new AppError('Pengguna tidak ditemukan.', 404);
  }

  const todayStr = getWIBDateString();
  const userDateStr = user.daily_report_date ? getWIBDateString(user.daily_report_date) : '';
  const count = userDateStr === todayStr ? user.daily_report_count : 0;
  const { resetDateStr } = calculateWIBResetInfo();

  return {
    dailyCount: count,
    maxLimit: 3,
    remainingQuota: Math.max(0, 3 - count),
    resetAt: resetDateStr,
  };
}
