import express from 'express';
import * as analisisController from '../controllers/analisisController.js';

const router = express.Router();

router.get('/partido/:partidoId', analisisController.obtenerResumenAnalisisPartido);

export default router;
