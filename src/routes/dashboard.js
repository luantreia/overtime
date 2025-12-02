import express from 'express';
import { getAdminDashboardStats } from '../controllers/dashboardController.js';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';

const router = express.Router();

const admin = (req, res, next) => {
  if (req.user && req.user.rol === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'No autorizado como admin' });
  }
};

router.get('/admin-stats', verificarToken, cargarRolDesdeBD, admin, getAdminDashboardStats);

export default router;
