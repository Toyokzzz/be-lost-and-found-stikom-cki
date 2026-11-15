import { Router } from 'express';
import { getCategories, getStorageLocations, getPublicStats } from '../controllers/master.controller';

const router = Router();

router.get('/categories', getCategories);
router.get('/locations', getStorageLocations);
router.get('/stats', getPublicStats);

export default router;
