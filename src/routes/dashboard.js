import express from 'express';
import { getAdminDashboardStats } from '../controllers/dashboardController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/admin-stats', protect, admin, getAdminDashboardStats);

export default router;
