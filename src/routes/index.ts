import { Router } from 'express';
import authRoutes from './auth.routes';
import itemsRoutes from './items.routes';
import claimsRoutes from './claims.routes';
import masterRoutes from './master.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/items', itemsRoutes);
router.use('/claims', claimsRoutes);
router.use('/admin', adminRoutes);
router.use('/', masterRoutes);

export default router;
