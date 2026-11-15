/**
 * Normalisasi teks untuk membandingkan jawaban hidden detail.
 * Menghilangkan tanda baca, spasi berlebih, dan mengubah ke huruf kecil.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenisasi teks menjadi kumpulan kata penting (kata dengan panjang > 2 huruf).
 */
export function tokenizeText(text: string): Set<string> {
  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter((w) => w.length > 2);
  return new Set(words);
}

/**
 * Memeriksa kesesuaian antara jawaban klaim pengguna dengan hidden detail yang tersimpan.
 * Menggunakan perpaduan exact match, substring inclusion, dan keyword token overlap.
 */
export function verifyHiddenDetail(actualDetail: string, claimedAnswer: string): boolean {
  const normActual = normalizeText(actualDetail);
  const normClaimed = normalizeText(claimedAnswer);

  if (!normActual || !normClaimed) return false;

  // 1. Direct match or substring match
  if (normActual === normClaimed || normActual.includes(normClaimed) || normClaimed.includes(normActual)) {
    return true;
  }

  // 2. Token overlap similarity
  const actualTokens = tokenizeText(normActual);
  const claimedTokens = tokenizeText(normClaimed);

  if (actualTokens.size === 0 || claimedTokens.size === 0) return false;

  let matchCount = 0;
  for (const token of claimedTokens) {
    if (actualTokens.has(token)) {
      matchCount++;
    }
  }

  // Jika minimal 50% kata kunci dari klaim cocok dengan actual detail, atau minimal 2 kata kunci spesifik cocok
  const matchRatio = matchCount / claimedTokens.size;
  return matchRatio >= 0.5 || matchCount >= 2;
}
