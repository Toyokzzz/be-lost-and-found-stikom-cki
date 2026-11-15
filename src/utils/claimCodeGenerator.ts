import crypto from 'crypto';

const CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 characters, no ambiguous 0/O/1/I

/**
 * Menghasilkan Claim Code 6-karakter unik menggunakan generator kriptografis aman.
 * Sesuai CST-06 & SRS-FR-005.
 */
export function generateClaimCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = bytes[i] % CHARSET.length;
    code += CHARSET[randomIndex];
  }
  return code;
}
