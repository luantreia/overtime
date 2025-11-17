import express from 'express';
import verificarToken from '../../middleware/authMiddleware.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { actualizarEstadisticasEquipoPartido } from '../../utils/estadisticasAggregator.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: EstadisticasEquipoPartido
 *   description: Estadísticas agregadas por equipo en un partido
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     EstadisticasEquipoPartido:
 *       type: object
 *       required:
 *         - partido
 *         - equipo
 *       properties:
 *         _id:
 *           type: string
 *         partido:
 *           type: string
 *           format: ObjectId
 *           description: Referencia al partido
 *         equipo:
 *           type: string
 *           format: ObjectId
 *           description: Referencia al equipo
 *         equipoPartido:
 *           type: string
 *           format: ObjectId
 *           description: Referencia al vínculo equipo-partido (opcional)
 *         throws:
 *           type: number
 *           nullable: true
 *           example: 120
 *         hits:
 *           type: number
 *           nullable: true
 *           example: 65
 *         outs:
 *           type: number
 *           nullable: true
 *           example: 55
 *         catches:
 *           type: number
 *           nullable: true
 *           example: 18
 *         calculado:
 *           type: boolean
 *           description: Indica si fue calculado automáticamente
 *           default: false
 *         creadoPor:
 *           type: string
 *           description: ID del usuario que creó/actualizó
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/estadisticas/equipo-partido/actualizar:
 *   post:
 *     summary: Actualiza estadísticas de un equipo en un partido
 *     description: Recalcula y guarda las estadísticas agregadas del equipo para el partido indicado.
 *     tags: [EstadisticasEquipoPartido]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - partidoId
 *               - equipoId
 *             properties:
 *               partidoId:
 *                 type: string
 *                 format: ObjectId
 *               equipoId:
 *                 type: string
 *                 format: ObjectId
 *               creadoPor:
 *                 type: string
 *                 description: UID del usuario (opcional; por defecto el usuario autenticado)
 *     responses:
 *       200:
 *         description: Estadísticas actualizadas correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                 estadisticas:
 *                   $ref: '#/components/schemas/EstadisticasEquipoPartido'
 *       400:
 *         description: Faltan parámetros requeridos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No se pudieron calcular estadísticas para el equipo/partido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// POST /api/estadisticas/equipo-partido/actualizar
// Actualiza las estadísticas agregadas de un equipo en un partido
router.post('/actualizar', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { partidoId, equipoId, creadoPor } = req.body;

    if (!partidoId || !equipoId) {
      return res.status(400).json({
        error: 'Se requieren partidoId y equipoId'
      });
    }

    console.log(' Solicitud de actualización de estadísticas de equipo:', { partidoId, equipoId });

    const estadisticasEquipo = await actualizarEstadisticasEquipoPartido(
      partidoId,
      equipoId,
      creadoPor || req.user.uid
    );

    if (!estadisticasEquipo) {
      return res.status(404).json({
        error: 'No se pudieron calcular estadísticas para este equipo en este partido'
      });
    }

    res.json({
      mensaje: 'Estadísticas de equipo actualizadas correctamente',
      estadisticas: estadisticasEquipo
    });

  } catch (error) {
    console.error(' Error en POST /api/estadisticas/equipo-partido/actualizar:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      detalle: error.message
    });
  }
});

/**
 * @swagger
 * /api/estadisticas/equipo-partido:
 *   get:
 *     summary: Lista estadísticas de equipo en un partido
 *     description: Permite filtrar por partido y/o equipo. Devuelve datos con partido y equipo poblados.
 *     tags: [EstadisticasEquipoPartido]
 *     parameters:
 *       - in: query
 *         name: partido
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del partido
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del equipo
 *     responses:
 *       200:
 *         description: Lista de estadísticas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EstadisticasEquipoPartido'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /api/estadisticas/equipo-partido?partido=...&equipo=...
// Obtener estadísticas de equipo en un partido
router.get('/', async (req, res) => {
  try {
    const { partido, equipo } = req.query;

    const filtro = {};
    if (partido) filtro.partido = partido;
    if (equipo) filtro.equipo = equipo;

    const { default: EstadisticasEquipoPartido } = await import('../../models/Equipo/EstadisticasEquipoPartido.js');

    const estadisticas = await EstadisticasEquipoPartido.find(filtro)
      .populate('partido', 'nombrePartido fecha')
      .populate('equipo', 'nombre escudo')
      .lean();

    res.json(estadisticas);
  } catch (error) {
    console.error('Error obteniendo estadísticas de equipo-partido:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;