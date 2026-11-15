import { Router } from 'express';
import { verifyClaim, completeClaim, getMyClaims } from '../controllers/claims.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Protected claims routes
router.post('/verify', requireAuth, verifyClaim);
router.post('/complete', requireAuth, completeClaim);
router.get('/my', requireAuth, getMyClaims);

export default router;
