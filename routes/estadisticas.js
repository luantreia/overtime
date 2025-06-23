// routes/estadisticas.js
import express from 'express';
import { obtenerResumenEstadisticasJugador } from '../controllers/estadisticasController.js';

const router = express.Router();

router.get('/jugador/:jugadorId/resumen', obtenerResumenEstadisticasJugador);

export default router;
