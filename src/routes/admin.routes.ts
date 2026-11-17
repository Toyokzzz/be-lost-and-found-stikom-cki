import { Router } from 'express';
import {
  getStats,
  getAllAdminItems,
  moderateItem,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllLocationsAdmin,
  createLocation,
  updateLocation,
  toggleLocationActive,
  deleteLocation,
  resolveStuckClaim,
  getFODashboardData,
  verifyFOCodeAndHandover,
} from '../controllers/admin.controller';
import { verifyToken, isAdmin, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// Seluruh endpoint API ber-prefix /api/admin/... wajib dilindungi oleh middleware verifyToken dan isAdmin
router.use(verifyToken, isAdmin);

// Root Admin Check / Ping
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin API Access Authorized.',
    admin: {
      id: req.user?.id,
      name: req.user?.name,
      role: req.user?.role,
    },
  });
});

// Panel Front Office (Admin FO, Admin Developer, Super Admin)
router.get('/fo/dashboard', requireRole('admin_fo', 'admin_developer', 'admin'), getFODashboardData);
router.post('/fo/verify-handover', requireRole('admin_fo', 'admin_developer', 'admin'), verifyFOCodeAndHandover);

// Panel Admin Developer & Super Admin (Statistik, Moderasi, Master Data & Resolusi Klaim)
router.get('/stats', requireRole('admin_developer', 'admin'), getStats);
router.get('/items', requireRole('admin_developer', 'admin'), getAllAdminItems);
router.post('/items/:type/:id/moderate', requireRole('admin_developer', 'admin'), moderateItem);

// Master Kategori
router.post('/categories', requireRole('admin_developer', 'admin'), createCategory);
router.put('/categories/:id', requireRole('admin_developer', 'admin'), updateCategory);
router.delete('/categories/:id', requireRole('admin_developer', 'admin'), deleteCategory);

// Master Lokasi FO
router.get('/locations', requireRole('admin_developer', 'admin'), getAllLocationsAdmin);
router.post('/locations', requireRole('admin_developer', 'admin'), createLocation);
router.put('/locations/:id', requireRole('admin_developer', 'admin'), updateLocation);
router.patch('/locations/:id/toggle-active', requireRole('admin_developer', 'admin'), toggleLocationActive);
router.delete('/locations/:id', requireRole('admin_developer', 'admin'), deleteLocation);

// Resolusi Klaim
router.post('/claims/resolve', requireRole('admin_developer', 'admin'), resolveStuckClaim);

export default router;
