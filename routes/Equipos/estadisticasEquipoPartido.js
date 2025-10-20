import express from 'express';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { actualizarEstadisticasEquipoPartido } from '../../utils/estadisticasAggregator.js';

const router = express.Router();

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

    console.log('🔄 Solicitud de actualización de estadísticas de equipo:', { partidoId, equipoId });

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
    console.error('❌ Error en POST /api/estadisticas/equipo-partido/actualizar:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      detalle: error.message
    });
  }
});

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