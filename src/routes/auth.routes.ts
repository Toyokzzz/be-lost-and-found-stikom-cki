import { Router } from 'express';
import { register, login, getMe, googleLogin, updateProfile, getGoogleConfig } from '../controllers/auth.controller';
import { verifyToken, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/google/config', getGoogleConfig);
router.post('/google', googleLogin);
router.get('/me', verifyToken, requireAuth, getMe);
router.put('/profile', verifyToken, requireAuth, updateProfile);

export default router;
