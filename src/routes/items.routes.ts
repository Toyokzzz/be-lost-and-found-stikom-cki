import { Router } from 'express';
import {
  getItems,
  getItemDetail,
  reportFound,
  reportLost,
  getMyReports,
} from '../controllers/items.controller';
import { authenticate, verifyToken, requireAuth, requireCompleteProfile } from '../middlewares/auth.middleware';
import { upload } from '../utils/upload';

const router = Router();

// Protected routes (Wajib login mahasiswa / civitas kampus & profil lengkap)
router.post('/found', verifyToken, requireAuth, requireCompleteProfile, upload.single('photo'), reportFound);
router.post('/lost', verifyToken, requireAuth, requireCompleteProfile, upload.single('photo'), reportLost);

// Riwayat laporan pengguna yang login (harus didefinisikan sebelum parameterized route /:type/:id)
router.get('/user/my-reports', verifyToken, requireAuth, getMyReports);
router.get('/my-reports', verifyToken, requireAuth, getMyReports);

// Public routes (dengan authenticate opsional agar req.user tersedia jika client login)
router.get('/', authenticate, getItems);
router.get('/:type/:id', authenticate, getItemDetail);

export default router;
