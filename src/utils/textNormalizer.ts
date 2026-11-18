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
 * Daftar kata umum / stopwords yang tidak boleh digunakan sebagai basis validasi klaim (SEC-02).
 */
export const STOP_WORDS = new Set([
  'ada', 'dan', 'di', 'ke', 'dari', 'yang', 'ini', 'itu', 'pada', 'untuk',
  'dengan', 'saya', 'dia', 'mereka', 'kita', 'kami', 'kamu', 'anda', 'milik',
  'punya', 'adalah', 'yaitu', 'yakni', 'seperti', 'bagian', 'bawah', 'atas',
  'dalam', 'luar', 'sudah', 'telah', 'sedang', 'akan', 'bisa', 'dapat',
  'tidak', 'bukan', 'hanya', 'juga', 'atau', 'serta', 'namun', 'tetapi',
  'the', 'is', 'at', 'which', 'on', 'in', 'and', 'or', 'to', 'for', 'of', 'with'
]);

/**
 * Tokenisasi teks menjadi kumpulan kata penting (kata dengan panjang > 2 huruf dan bukan stopword).
 */
export function tokenizeText(text: string): Set<string> {
  const normalized = normalizeText(text);
  const words = normalized
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Memeriksa kesesuaian antara jawaban klaim pengguna dengan hidden detail yang tersimpan.
 * Memperbaiki celah SEC-02:
 * 1. Menghilangkan raw substring includes() yang rentan false-positive pada kata umum (misal 'ada', 'dan').
 * 2. Mengabaikan stopwords umum.
 * 3. Mewajibkan minimal 2 kata kunci spesifik yang cocok, atau exact match kata kunci signifikan.
 */
export function verifyHiddenDetail(actualDetail: string, claimedAnswer: string): boolean {
  const normActual = normalizeText(actualDetail);
  const normClaimed = normalizeText(claimedAnswer);

  if (!normActual || !normClaimed) return false;

  // 1. Exact match teks lengkap (case-insensitive & tanda baca/spasi dinormalisasi)
  // Mendukung jawaban singkat 1 karakter (huruf/angka) hingga 20 karakter
  if (normActual === normClaimed) {
    return true;
  }

  const actualTokens = tokenizeText(normActual);
  const claimedTokens = tokenizeText(normClaimed);

  // Jika input pengguna tidak memiliki kata kunci signifikan (misal hanya kata 'ada', 'dan', 'di')
  if (claimedTokens.size === 0 || actualTokens.size === 0) {
    return false;
  }

  // 2. Token overlap similarity berbasis kata kunci non-stopword
  let matchCount = 0;
  for (const token of claimedTokens) {
    if (actualTokens.has(token)) {
      matchCount++;
    }
  }

  // Jika actual detail hanya memiliki 1 kata kunci spesifik
  if (actualTokens.size === 1) {
    return matchCount === 1;
  }

  // Jika actual detail memiliki >= 2 kata kunci, klaim harus mencocokkan minimal 2 kata kunci spesifik
  if (matchCount >= 2) {
    return true;
  }

  return false;
}
