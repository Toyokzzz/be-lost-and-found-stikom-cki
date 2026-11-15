import { getWIBDateString, calculateWIBResetInfo } from '../src/services/quota.service';

describe('Daily Quota & Timezone Service (CST-03 & SRS-FR-003)', () => {
  it('should format date string in YYYY-MM-DD format based on WIB', () => {
    const fixedDate = new Date('2026-11-12T03:00:00.000Z'); // 10:00 AM WIB
    const wibStr = getWIBDateString(fixedDate);
    expect(wibStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(wibStr).toBe('2026-11-12');
  });

  it('should correctly cross into next day for late UTC times in WIB (UTC+7)', () => {
    // 2026-11-12 18:00 UTC = 2026-11-13 01:00 WIB
    const lateUtcDate = new Date('2026-11-12T18:00:00.000Z');
    const wibStr = getWIBDateString(lateUtcDate);
    expect(wibStr).toBe('2026-11-13');
  });

  it('should calculate remaining reset info with positive milliseconds', () => {
    const { resetDateStr, remainingMs } = calculateWIBResetInfo();
    expect(resetDateStr).toBeDefined();
    expect(typeof remainingMs).toBe('number');
    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});
