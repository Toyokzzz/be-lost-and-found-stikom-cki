import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { config } from '../src/config';

describe('Riwayat Saya (User Reports & Claims) Route Protection & Routing Order', () => {
  const secret = config.jwtSecret;

  const validUserToken = jwt.sign(
    { id: 'user-history-test-1', name: 'Mahasiswa Riwayat', email: 'riwayat@stikomcki.ac.id', role: 'mahasiswa' },
    secret,
    { expiresIn: '1h' }
  );

  describe('GET /api/items/user/my-reports routing precedence', () => {
    it('is not shadowed by /:type/:id and returns 401 when unauthenticated', async () => {
      const response = await request(app).get('/api/items/user/my-reports');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      // Crucial assertion: Must NOT be caught by getItemDetail ('Tipe barang tidak valid')
      expect(response.body.message).not.toContain('Tipe barang tidak valid');
      expect(response.body.message).toContain('Akses ditolak');
    });

    it('rejects invalid bearer token with 401', async () => {
      const response = await request(app)
        .get('/api/items/user/my-reports')
        .set('Authorization', 'Bearer invalid-token');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('alias /api/items/my-reports is also properly routed and protected with 401', async () => {
      const response = await request(app).get('/api/items/my-reports');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).not.toContain('Tipe barang tidak valid');
    });
  });

  describe('GET /api/claims/my route protection', () => {
    it('returns 401 when token is missing', async () => {
      const response = await request(app).get('/api/claims/my');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('alias /api/claims/my-claims is properly routed and protected with 401', async () => {
      const response = await request(app).get('/api/claims/my-claims');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
