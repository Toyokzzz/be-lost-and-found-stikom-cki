import { Router } from 'express';
import { verifyClaim, completeClaim, getMyClaims, getClaimsOnMyItems } from '../controllers/claims.controller';
import { verifyToken, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Protected claims routes
router.post('/verify', verifyToken, requireAuth, verifyClaim);

// Konfirmasi serah terima — bisa dilakukan oleh pengklaim ATAU pelapor penemu barang
router.post('/complete', verifyToken, requireAuth, completeClaim);

// Riwayat klaim yang diajukan oleh user (sebagai pengklaim)
router.get('/my', verifyToken, requireAuth, getMyClaims);

// Klaim yang masuk pada barang temuan milik user (sebagai pelapor penemu)
// Digunakan untuk fitur "barang sudah diklaim" yang dipindah dari admin FO ke user pelapor
router.get('/on-my-items', verifyToken, requireAuth, getClaimsOnMyItems);

export default router;
