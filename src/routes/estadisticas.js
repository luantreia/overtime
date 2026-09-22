// routes/estadisticas.js
import express from 'express';
import { obtenerResumenEstadisticasJugador, obtenerResumenEstadisticasEquipo } from '../controllers/estadisticasController.js';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import { requireTeamPermission } from '../middleware/requireTeamPermission.js';
import { obtenerFilasAnaliticas } from '../services/filasAnaliticasService.js';

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
router.get('/jugador/:jugadorId/resumen', verificarToken, cargarRolDesdeBD, obtenerResumenEstadisticasJugador);

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
router.get('/equipo/:equipoId/resumen', verificarToken, cargarRolDesdeBD, obtenerResumenEstadisticasEquipo);

/**
 * GET /api/estadisticas/equipo/:equipoId/filas
 *
 * El dataset plano del que cuelga toda la pantalla de estadísticas del DT: una fila por jugador
 * y por set, con los atributos del partido encima y la fuente (oficial o planilla propia) ya
 * resuelta partido por partido. El razonamiento completo está en `filasAnaliticasService.js`.
 *
 * Incluye datos privados del equipo (sus planillas), así que pide `stats.view_private`.
 *
 * `?perspectiva=<equipoId>` arma las filas a través de otro equipo en vez de `equipoId` — para
 * ver, con el mismo motor de análisis, lo que este equipo capturó sobre un rival (o sobre un
 * partido scouteado a terceros). Sigue leyendo sólo las planillas de `equipoId`, nunca las de
 * otro: no es un permiso nuevo, sólo deja de descartar presentes del otro lado.
 */
router.get(
  '/equipo/:equipoId/filas',
  verificarToken,
  cargarRolDesdeBD,
  requireTeamPermission({
    permission: 'stats.view_private',
    resolveEquipoId: (req) => req.params.equipoId,
    missingMessage: 'Se requiere el equipo para validar permisos de lectura',
  }),
  async (req, res) => {
    try {
      const filas = await obtenerFilasAnaliticas(req.equipoIdPermisos, {
        desde: req.query.desde,
        hasta: req.query.hasta,
        perspectiva: req.query.perspectiva,
      });
      return res.json({ filas });
    } catch (error) {
      console.error('Error armando filas analiticas:', error);
      return res.status(500).json({ message: 'Error al armar las estadisticas del equipo' });
    }
  },
);

export default router;
