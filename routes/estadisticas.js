// routes/estadisticas.js
import express from 'express';
import { obtenerResumenEstadisticasJugador, obtenerResumenEstadisticasEquipo } from '../controllers/estadisticasController.js';

const router = express.Router();

router.get('/jugador/:jugadorId/resumen', obtenerResumenEstadisticasJugador);

router.get('/equipo/:equipoId/resumen', obtenerResumenEstadisticasEquipo);

export default router;
