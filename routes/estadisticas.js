// routes/estadisticas.js
import express from 'express';
import { obtenerResumenEstadisticasJugador, obtenerResumenEstadisticasEquipo } from '../controllers/estadisticasController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Estadisticas
 *   description: Endpoints de resúmenes estadísticos para jugadores y equipos
 */


/**
 * @swagger
 * /api/estadisticas/jugador/{jugadorId}/resumen:
 *   get:
 *     summary: Obtiene el resumen de estadísticas para un jugador
 *     tags: [Estadisticas]
 *     parameters:
 *       - in: path
 *         name: jugadorId
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Resumen de estadísticas del jugador
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResumenEstadisticas'
 *       500:
 *         description: Error al obtener resumen
 */
router.get('/jugador/:jugadorId/resumen', obtenerResumenEstadisticasJugador);

/**
 * @swagger
 * /api/estadisticas/equipo/{equipoId}/resumen:
 *   get:
 *     summary: Obtiene el resumen de estadísticas para un equipo
 *     tags: [Estadisticas]
 *     parameters:
 *       - in: path
 *         name: equipoId
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Resumen de estadísticas del equipo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResumenEstadisticas'
 *       500:
 *         description: Error al obtener resumen
 */
router.get('/equipo/:equipoId/resumen', obtenerResumenEstadisticasEquipo);

export default router;
