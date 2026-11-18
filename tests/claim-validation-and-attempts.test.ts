import { normalizeText, verifyHiddenDetail } from '../src/utils/textNormalizer';
import {
  checkClaimAttemptStatus,
  recordFailedAttempt,
  recordSuccessfulClaim,
  getAttemptStatus,
  resetAllAttempts,
} from '../src/services/claimAttempt.service';

describe('TDD: Claim Validation & Attempt Cooldown (1-20 chars & 3-attempt 60m lock)', () => {
  beforeEach(() => {
    resetAllAttempts();
  });

  describe('1. Hidden Detail & Claim Answer Validation (1-20 alphanumeric characters)', () => {
    it('matches 1-character letter answers exactly (case-insensitive)', () => {
      expect(verifyHiddenDetail('A', 'a')).toBe(true);
      expect(verifyHiddenDetail('Z', 'z')).toBe(true);
      expect(verifyHiddenDetail('A', 'b')).toBe(false);
    });

    it('matches 1-character number answers exactly', () => {
      expect(verifyHiddenDetail('7', '7')).toBe(true);
      expect(verifyHiddenDetail('0', '0')).toBe(true);
      expect(verifyHiddenDetail('7', '8')).toBe(false);
    });

    it('matches answers up to 20 characters exactly', () => {
      const answer20 = 'KUNCI HONDA VARIO 12'; // 20 chars
      expect(answer20.length).toBe(20);
      expect(verifyHiddenDetail(answer20, 'kunci honda vario 12')).toBe(true);
    });

    it('matches short alphanumeric codes (e.g. B12, K3, A01)', () => {
      expect(verifyHiddenDetail('B12', 'b12')).toBe(true);
      expect(verifyHiddenDetail('K3', 'k3')).toBe(true);
      expect(verifyHiddenDetail('A01', 'a01')).toBe(true);
    });

    it('rejects wrong 1-character answers', () => {
      expect(verifyHiddenDetail('A', 'X')).toBe(false);
      expect(verifyHiddenDetail('5', '9')).toBe(false);
    });
  });

  describe('2. 3-Attempt Limit & 60-Minute Cooldown Logic', () => {
    const userId = 'user-test-claimant-1';
    const foundItemId = 'item-test-found-1';

    it('allows initial attempt with 3 attempts remaining', () => {
      const status = checkClaimAttemptStatus(userId, foundItemId);
      expect(status.allowed).toBe(true);
      expect(status.remainingAttempts).toBe(3);
    });

    it('records 1st failed attempt, leaving 2 attempts remaining', () => {
      const result = recordFailedAttempt(userId, foundItemId);
      expect(result.remainingAttempts).toBe(2);
      expect(result.isLocked).toBe(false);

      const status = checkClaimAttemptStatus(userId, foundItemId);
      expect(status.allowed).toBe(true);
      expect(status.remainingAttempts).toBe(2);
    });

    it('records 2nd failed attempt, leaving 1 attempt remaining', () => {
      recordFailedAttempt(userId, foundItemId);
      const result = recordFailedAttempt(userId, foundItemId);
      expect(result.remainingAttempts).toBe(1);
      expect(result.isLocked).toBe(false);

      const status = checkClaimAttemptStatus(userId, foundItemId);
      expect(status.allowed).toBe(true);
      expect(status.remainingAttempts).toBe(1);
    });

    it('records 3rd failed attempt and locks out the user for 60 minutes', () => {
      recordFailedAttempt(userId, foundItemId);
      recordFailedAttempt(userId, foundItemId);
      const result = recordFailedAttempt(userId, foundItemId);

      expect(result.remainingAttempts).toBe(0);
      expect(result.isLocked).toBe(true);
      expect(result.lockedMinutesRemaining).toBe(60);

      // Now checkClaimAttemptStatus must block with isLocked true
      const status = checkClaimAttemptStatus(userId, foundItemId);
      expect(status.allowed).toBe(false);
      expect(status.isLocked).toBe(true);
      expect(status.lockedMinutesRemaining).toBeGreaterThanOrEqual(59);
    });

    it('resets attempt count when user answers correctly', () => {
      recordFailedAttempt(userId, foundItemId);
      recordFailedAttempt(userId, foundItemId);
      expect(getAttemptStatus(userId, foundItemId).attemptCount).toBe(2);

      recordSuccessfulClaim(userId, foundItemId);
      expect(getAttemptStatus(userId, foundItemId).attemptCount).toBe(0);
      expect(checkClaimAttemptStatus(userId, foundItemId).remainingAttempts).toBe(3);
    });

    it('expires cooldown after 60 minutes and resets attempt count', () => {
      recordFailedAttempt(userId, foundItemId);
      recordFailedAttempt(userId, foundItemId);
      recordFailedAttempt(userId, foundItemId);

      // Verify locked
      expect(checkClaimAttemptStatus(userId, foundItemId).allowed).toBe(false);

      // Simulate passage of 61 minutes
      const pastTime = Date.now() - (61 * 60 * 1000);
      const record = getAttemptStatus(userId, foundItemId);
      if (record.lockedUntil) {
        record.lockedUntil = new Date(Date.now() - 1000); // 1 second ago
      }

      // Check again, should be unlocked and reset
      const status = checkClaimAttemptStatus(userId, foundItemId);
      expect(status.allowed).toBe(true);
      expect(status.remainingAttempts).toBe(3);
      expect(status.isLocked).toBe(false);
    });
  });

  describe('3. Zod Schema Length Bounds (1 - 20 chars)', () => {
    const { z } = require('zod');

    const validationKeySchema = z
      .string()
      .min(1)
      .max(20)
      .transform((val: string) => val.trim().toUpperCase());

    const claimAnswerSchema = z
      .string()
      .min(1, 'Jawaban validasi minimal 1 karakter')
      .max(20, 'Jawaban validasi maksimal 20 karakter');

    it('accepts 1 character for hidden detail and claim answer', () => {
      expect(validationKeySchema.parse('A')).toBe('A');
      expect(validationKeySchema.parse('1')).toBe('1');
      expect(claimAnswerSchema.parse('A')).toBe('A');
      expect(claimAnswerSchema.parse('7')).toBe('7');
    });

    it('accepts up to 20 characters for hidden detail and claim answer', () => {
      const text20 = '12345678901234567890';
      expect(text20.length).toBe(20);
      expect(validationKeySchema.parse(text20)).toBe(text20);
      expect(claimAnswerSchema.parse(text20)).toBe(text20);
    });

    it('rejects empty input (< 1 char)', () => {
      expect(() => validationKeySchema.parse('')).toThrow();
      expect(() => claimAnswerSchema.parse('')).toThrow();
    });

    it('rejects input exceeding 20 characters (> 20 chars)', () => {
      const text21 = '123456789012345678901';
      expect(text21.length).toBe(21);
      expect(() => validationKeySchema.parse(text21)).toThrow();
      expect(() => claimAnswerSchema.parse(text21)).toThrow();
    });
  });
});
