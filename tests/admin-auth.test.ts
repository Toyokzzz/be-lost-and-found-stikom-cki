import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { config } from '../src/config';
import { verifyToken, isAdmin } from '../src/middlewares/auth.middleware';
import { Request, Response } from 'express';

describe('Admin Security Middleware (/api/admin/...) and Route Protection', () => {
  const secret = config.jwtSecret;

  const validAdminToken = jwt.sign(
    { id: 'admin-1', name: 'Admin Test', email: 'admin@stikomcki.ac.id', role: 'admin' },
    secret,
    { expiresIn: '1h' }
  );

  const validMahasiswaToken = jwt.sign(
    { id: 'mhs-1', name: 'Mahasiswa Test', email: 'mhs@stikomcki.ac.id', role: 'mahasiswa' },
    secret,
    { expiresIn: '1h' }
  );

  describe('verifyToken unit tests', () => {
    it('returns 401 when Authorization header is missing', () => {
      const req = { headers: {} } as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when token is invalid', () => {
      const req = { headers: { authorization: 'Bearer invalid-token' } } as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next and attaches req.user when token is valid', () => {
      const req = { headers: { authorization: `Bearer ${validMahasiswaToken}` } } as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      verifyToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.role).toBe('mahasiswa');
    });
  });

  describe('isAdmin unit tests', () => {
    it('returns 401 when req.user is undefined', () => {
      const req = {} as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      isAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when req.user role is not admin', () => {
      const req = {
        user: { id: 'mhs-1', name: 'Mahasiswa', email: 'mhs@test.com', role: 'mahasiswa' },
      } as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      isAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next when req.user role is admin', () => {
      const req = {
        user: { id: 'admin-1', name: 'Admin', email: 'admin@test.com', role: 'admin' },
      } as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      isAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Integration test for /api/admin/* endpoints', () => {
    it('rejects access without token with 401', async () => {
      const response = await request(app).get('/api/admin/stats');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects access with invalid token with 401', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer invalid.jwt.token');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects access with non-admin (mahasiswa) token with 403', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${validMahasiswaToken}`);
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Administrator');
    });
  });
});
