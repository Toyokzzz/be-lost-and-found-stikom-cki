import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Auth API (Register & Login with PostgreSQL via Prisma)', () => {
  const testEmail = `civitas_${Date.now()}@stikomcki.ac.id`;
  const rawPassword = 'PasswordMahasiswa123';
  const testName = 'Mahasiswa CKI Aktif';
  const testPhone = '081298765432';

  afterAll(async () => {
    // Cleanup created test user
    try {
      await prisma.user.deleteMany({
        where: { email: testEmail },
      });
    } catch (e) {
      // ignore
    }
  });

  describe('POST /api/auth/register', () => {
    it('successfully registers a new user with bcrypt-hashed password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: testName,
          email: testEmail,
          password: rawPassword,
          phone: testPhone,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testEmail.toLowerCase());
      expect(response.body.data.user.role).toBe('mahasiswa');
      expect(response.body.data.token).toBeDefined();

      // Verify directly in DB that password is encrypted with bcrypt
      const dbUser = await prisma.user.findUnique({
        where: { email: testEmail.toLowerCase() },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser!.password_hash).not.toBe(rawPassword);
      expect(dbUser!.password_hash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
      const isMatch = await bcrypt.compare(rawPassword, dbUser!.password_hash);
      expect(isMatch).toBe(true);
    });

    it('rejects duplicate email with 400', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: testName,
          email: testEmail,
          password: rawPassword,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('sudah terdaftar');
    });

    it('validates password minimum length of 6 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test Pendek',
          email: `short_${Date.now()}@stikomcki.ac.id`,
          password: '123',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('authenticates valid credentials from database', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: rawPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testEmail.toLowerCase());
      expect(response.body.data.token).toBeDefined();
    });

    it('rejects incorrect password with 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword999',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects non-existent email with 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent_user@stikomcki.ac.id',
          password: 'AnyPassword123',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
