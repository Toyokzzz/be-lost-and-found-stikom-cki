import { normalizeText, tokenizeText, verifyHiddenDetail } from '../src/utils/textNormalizer';

describe('Hidden Detail Text Normalizer & Matcher (SRS-FR-005)', () => {
  describe('normalizeText', () => {
    it('should strip punctuation and extra whitespace and lowercase text', () => {
      const raw = '  Stiker Apel Mini... di Bawah Laptop!!!  ';
      expect(normalizeText(raw)).toBe('stiker apel mini di bawah laptop');
    });

    it('should handle empty or null string gracefully', () => {
      expect(normalizeText('')).toBe('');
    });
  });

  describe('tokenizeText', () => {
    it('should extract words longer than 2 characters into a set and exclude 1-2 char words', () => {
      const tokens = tokenizeText('ada di ke gantungan kunci karakter anime naruto');
      expect(tokens.has('gantungan')).toBe(true);
      expect(tokens.has('kunci')).toBe(true);
      expect(tokens.has('karakter')).toBe(true);
      expect(tokens.has('anime')).toBe(true);
      expect(tokens.has('naruto')).toBe(true);
      expect(tokens.has('di')).toBe(false); // <= 2 chars excluded
      expect(tokens.has('ke')).toBe(false); // <= 2 chars excluded
    });
  });

  describe('verifyHiddenDetail', () => {
    const actualDetail = 'Stiker logo apel mini warna silver di bagian bawah docking charger';

    it('should return true for identical answer', () => {
      expect(verifyHiddenDetail(actualDetail, 'stiker logo apel mini warna silver di bagian bawah docking charger')).toBe(true);
    });

    it('should return true for case-insensitive and punctuated answer', () => {
      expect(verifyHiddenDetail(actualDetail, 'STIKER LOGO APEL MINI, DOCKING CHARGER!')).toBe(true);
    });

    it('should return true when key specific tokens match', () => {
      expect(verifyHiddenDetail(actualDetail, 'ada stiker apel mini')).toBe(true);
    });

    it('should return false for completely unrelated description', () => {
      expect(verifyHiddenDetail(actualDetail, 'ada gantungan kunci doraemon')).toBe(false);
    });

    it('should return false for empty or gibberish input', () => {
      expect(verifyHiddenDetail(actualDetail, '')).toBe(false);
      expect(verifyHiddenDetail('', 'stiker')).toBe(false);
      expect(verifyHiddenDetail(actualDetail, 'xyz abc qwe')).toBe(false);
    });

    it('should prevent SEC-02 vulnerability: common stopwords and single word substring guessing must fail', () => {
      // Kata umum / stopwords
      expect(verifyHiddenDetail(actualDetail, 'ada')).toBe(false);
      expect(verifyHiddenDetail(actualDetail, 'dan')).toBe(false);
      expect(verifyHiddenDetail(actualDetail, 'di')).toBe(false);
      expect(verifyHiddenDetail(actualDetail, 'yang')).toBe(false);
      expect(verifyHiddenDetail(actualDetail, 'bagian')).toBe(false);
      expect(verifyHiddenDetail(actualDetail, 'ada dan di')).toBe(false);

      // Substring tebakan 1 kata umum dari detail panjang
      expect(verifyHiddenDetail(actualDetail, 'stiker')).toBe(false);
    });
  });
});
