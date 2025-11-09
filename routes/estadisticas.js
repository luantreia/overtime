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
 * components:
 *   schemas:
 *     ResumenEstadisticasPartido:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         nombrePartido:
 *           type: string
 *         fecha:
 *           type: string
 *           format: date-time
 *         equipoLocal:
 *           type: string
 *         equipoVisitante:
 *           type: string
 *         marcadorLocal:
 *           type: number
 *         marcadorVisitante:
 *           type: number
 *         setsJugados:
 *           type: number
 *         throws:
 *           type: number
 *         hits:
 *           type: number
 *         outs:
 *           type: number
 *         catches:
 *           type: number
 *         efectividad:
 *           type: string
 *           nullable: true
 *         hoc:
 *           type: string
 *           nullable: true
 *     ResumenEstadisticas:
 *       type: object
 *       properties:
 *         totalPartidos:
 *           type: number
 *         totalSets:
 *           type: number
 *         totalThrows:
 *           type: number
 *         totalHits:
 *           type: number
 *         totalOuts:
 *           type: number
 *         totalCatches:
 *           type: number
 *         promedioThrows:
 *           type: string
 *         promedioHits:
 *           type: string
 *         promedioOuts:
 *           type: string
 *         promedioCatches:
 *           type: string
 *         promedioSetsPorPartido:
 *           type: string
 *         efectividadPromedio:
 *           type: string
 *           nullable: true
 *         promedioHOC:
 *           type: string
 *           nullable: true
 *         ultimoPartido:
 *           type: object
 *           nullable: true
 *           properties:
 *             fecha:
 *               type: string
 *               format: date-time
 *             equipoLocal:
 *               type: string
 *             equipoVisitante:
 *               type: string
 *             marcadorLocal:
 *               type: number
 *             marcadorVisitante:
 *               type: number
 *         estadisticasPorPartido:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ResumenEstadisticasPartido'
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
