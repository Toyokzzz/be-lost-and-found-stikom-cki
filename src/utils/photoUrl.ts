/**
 * Utility untuk menghasilkan URL foto yang dapat diakses frontend.
 * Memastikan photo_url selalu berupa URL lengkap (absolute URL) agar gambar
 * dapat tampil di user maupun admin.
 */

/**
 * Mengubah path relatif foto (mis: /uploads/xxx.jpg) menjadi URL absolut.
 * Jika sudah berupa URL lengkap (http/https), dikembalikan apa adanya.
 */
export function buildPhotoUrl(photoPath: string | null | undefined, req?: { protocol?: string; get?: (header: string) => string | undefined }): string | null {
  if (!photoPath) return null;

  // Jika sudah URL lengkap, kembalikan apa adanya
  if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
    return photoPath;
  }

  // Jika ada request object, build URL dari request
  if (req && req.protocol && req.get) {
    const host = req.get('host');
    if (host) {
      return `${req.protocol}://${host}${photoPath}`;
    }
  }

  // Fallback: gunakan BASE_URL dari environment atau default
  const baseUrl = process.env.BASE_URL || process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${baseUrl}${photoPath}`;
}

/**
 * Normalisasi photo_url pada object item.
 * Mengubah path relatif menjadi URL absolut.
 */
export function normalizePhotoUrl<T extends { photo_url?: string | null }>(
  item: T,
  req?: { protocol?: string; get?: (header: string) => string | undefined }
): T {
  return {
    ...item,
    photo_url: buildPhotoUrl(item.photo_url, req),
  };
}

/**
 * Normalisasi photo_url pada array item.
 */
export function normalizePhotoUrls<T extends { photo_url?: string | null }>(
  items: T[],
  req?: { protocol?: string; get?: (header: string) => string | undefined }
): T[] {
  return items.map((item) => normalizePhotoUrl(item, req));
}
