/**
 * Service untuk memantau percobaan verifikasi pertanyaan validasi klaim barang temuan.
 * Aturan Sistem:
 * 1. Setiap pengguna diberi maksimal 3 kali kesempatan menjawab pertanyaan validasi per barang temuan.
 * 2. Jika salah sebanyak 3 kali, sistem memberikan waktu jeda (cooldown) selama 60 menit.
 */

export interface AttemptRecord {
  attemptCount: number;
  lockedUntil: Date | null;
  lastAttemptAt: Date;
}

export interface AttemptCheckResult {
  allowed: boolean;
  isLocked: boolean;
  remainingAttempts: number;
  lockedMinutesRemaining?: number;
}

// In-memory store berbasis key `${userId}:${foundItemId}`
const attemptStore = new Map<string, AttemptRecord>();

const MAX_ATTEMPTS = 3;
const COOLDOWN_MINUTES = 60;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

function getStoreKey(userId: string, foundItemId: string): string {
  return `${userId}:${foundItemId}`;
}

/**
 * Memeriksa status percobaan klaim pengguna saat ini sebelum memproses jawaban.
 */
export function checkClaimAttemptStatus(userId: string, foundItemId: string): AttemptCheckResult {
  const key = getStoreKey(userId, foundItemId);
  const record = attemptStore.get(key);

  if (!record) {
    return {
      allowed: true,
      isLocked: false,
      remainingAttempts: MAX_ATTEMPTS,
    };
  }

  const now = Date.now();

  // Jika sedang terkunci
  if (record.lockedUntil) {
    const lockTime = record.lockedUntil.getTime();
    if (now < lockTime) {
      const remainingMs = lockTime - now;
      const lockedMinutesRemaining = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
      return {
        allowed: false,
        isLocked: true,
        remainingAttempts: 0,
        lockedMinutesRemaining,
      };
    }

    // Waktu jeda 60 menit telah habis, reset percobaan
    attemptStore.delete(key);
    return {
      allowed: true,
      isLocked: false,
      remainingAttempts: MAX_ATTEMPTS,
    };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - record.attemptCount);
  return {
    allowed: remaining > 0,
    isLocked: false,
    remainingAttempts: remaining,
  };
}

/**
 * Mencatat percobaan jawaban yang salah.
 * Mengembalikan status sisa kesempatan atau mengaktifkan jeda 60 menit jika sudah 3 kali salah.
 */
export function recordFailedAttempt(userId: string, foundItemId: string): {
  remainingAttempts: number;
  isLocked: boolean;
  lockedMinutesRemaining?: number;
} {
  const key = getStoreKey(userId, foundItemId);
  const now = new Date();
  let record = attemptStore.get(key);

  if (!record || (record.lockedUntil && now.getTime() >= record.lockedUntil.getTime())) {
    record = {
      attemptCount: 0,
      lockedUntil: null,
      lastAttemptAt: now,
    };
  }

  record.attemptCount += 1;
  record.lastAttemptAt = now;

  // Jika mencapai 3 kali percobaan
  if (record.attemptCount >= MAX_ATTEMPTS) {
    record.lockedUntil = new Date(now.getTime() + COOLDOWN_MS);
    attemptStore.set(key, record);
    return {
      remainingAttempts: 0,
      isLocked: true,
      lockedMinutesRemaining: COOLDOWN_MINUTES,
    };
  }

  attemptStore.set(key, record);
  return {
    remainingAttempts: MAX_ATTEMPTS - record.attemptCount,
    isLocked: false,
  };
}

/**
 * Mencatat keberhasilan klaim (reset riwayat percobaan salah).
 */
export function recordSuccessfulClaim(userId: string, foundItemId: string): void {
  const key = getStoreKey(userId, foundItemId);
  attemptStore.delete(key);
}

/**
 * Helper untuk pengujian atau inspeksi status
 */
export function getAttemptStatus(userId: string, foundItemId: string): AttemptRecord {
  const key = getStoreKey(userId, foundItemId);
  return attemptStore.get(key) || {
    attemptCount: 0,
    lockedUntil: null,
    lastAttemptAt: new Date(0),
  };
}

/**
 * Reset seluruh store percobaan (khusus pengujian)
 */
export function resetAllAttempts(): void {
  attemptStore.clear();
}
