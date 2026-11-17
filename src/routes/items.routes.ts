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

// Public routes (dengan authenticate opsional agar req.user tersedia jika client login)
router.get('/', authenticate, getItems);
router.get('/:type/:id', authenticate, getItemDetail);

// Protected routes (Wajib login mahasiswa / civitas kampus & profil lengkap)
router.post('/found', verifyToken, requireAuth, requireCompleteProfile, upload.single('photo'), reportFound);
router.post('/lost', verifyToken, requireAuth, requireCompleteProfile, upload.single('photo'), reportLost);
router.get('/user/my-reports', verifyToken, requireAuth, getMyReports);

export default router;
