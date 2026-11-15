import { isProfileComplete } from '../src/controllers/auth.controller';

describe('Profile Validation & Completeness Logic (Requirement 2)', () => {
  it('returns true when all required profile fields are present and valid', () => {
    const completeUser = {
      name: 'DIMAS PRASETYO',
      nim: '2024010101',
      prodi: 'Teknik Informatika',
      semester: 5,
      kelas: 'Pagi',
    };
    expect(isProfileComplete(completeUser)).toBe(true);
  });

  it('returns true for Malam class as well', () => {
    const completeUserMalam = {
      name: 'ANISA RAHMAWATI',
      nim: '2024010102',
      prodi: 'Sistem Informasi',
      semester: 3,
      kelas: 'Malam',
    };
    expect(isProfileComplete(completeUserMalam)).toBe(true);
  });

  it('returns false when NIM is missing or empty', () => {
    const incomplete = {
      name: 'DIMAS PRASETYO',
      nim: '',
      prodi: 'Teknik Informatika',
      semester: 5,
      kelas: 'Pagi',
    };
    expect(isProfileComplete(incomplete)).toBe(false);
  });

  it('returns false when Prodi is missing or empty', () => {
    const incomplete = {
      name: 'DIMAS PRASETYO',
      nim: '2024010101',
      prodi: '',
      semester: 5,
      kelas: 'Pagi',
    };
    expect(isProfileComplete(incomplete)).toBe(false);
  });

  it('returns false when Semester is outside 1-8 or missing', () => {
    expect(isProfileComplete({ name: 'A', nim: '1', prodi: 'TI', semester: 0, kelas: 'Pagi' })).toBe(false);
    expect(isProfileComplete({ name: 'A', nim: '1', prodi: 'TI', semester: 9, kelas: 'Pagi' })).toBe(false);
    expect(isProfileComplete({ name: 'A', nim: '1', prodi: 'TI', semester: null, kelas: 'Pagi' })).toBe(false);
  });

  it('returns false when Kelas is not Pagi or Malam', () => {
    expect(isProfileComplete({ name: 'A', nim: '1', prodi: 'TI', semester: 5, kelas: 'Siang' })).toBe(false);
    expect(isProfileComplete({ name: 'A', nim: '1', prodi: 'TI', semester: 5, kelas: '' })).toBe(false);
    expect(isProfileComplete({ name: 'A', nim: '1', prodi: 'TI', semester: 5, kelas: null })).toBe(false);
  });
});
