import express from 'express';
import * as estadisticasController from '../controllers/estadisticasController.js';

const router = express.Router();

// Obtener todas las estadísticas (sets) de un partido
router.get('/partido/:partidoId', estadisticasController.obtenerEstadisticasPartido);

// Actualizar o agregar estadística para un jugador en un set
router.put('/partido/:partidoId/sets/:numeroSet/jugador/:jugadorId', estadisticasController.actualizarEstadisticaJugadorSet);

export default router;
