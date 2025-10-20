import express from 'express';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import EstadisticasJugadorPartido from '../../models/Jugador/EstadisticasJugadorPartido.js';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';
import EstadisticasEquipoPartido from '../../models/Equipo/EstadisticasEquipoPartido.js';

const router = express.Router();

// GET /api/estadisticas/jugador-partido
router.get(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { partido, jugadorPartido, jugador, equipo } = req.query;
      
      // Construir filtro dinámico
      const filtro = {};
      
      // Si se solicita por partido, buscar a través de jugadorPartido
      if (partido) {
        // Necesitamos buscar los jugadorPartido que pertenezcan a este partido
        const { default: JugadorPartido } = await import('../../models/Jugador/JugadorPartido.js');
        const jugadoresDelPartido = await JugadorPartido.find({ partido }).select('_id');
        const idsJugadorPartido = jugadoresDelPartido.map(jp => jp._id);
        filtro.jugadorPartido = { $in: idsJugadorPartido };
      }
      
      if (jugadorPartido) filtro.jugadorPartido = jugadorPartido;
      if (jugador) filtro.jugador = jugador;
      if (equipo) filtro.equipo = equipo;

      const estadisticas = await EstadisticasJugadorPartido.find(filtro)
        .populate({
          path: 'jugadorPartido',
          populate: [
            { path: 'jugador', select: 'nombre apellido email' },
            { path: 'equipo', select: 'nombre' },
            { path: 'partido', select: 'nombrePartido fecha' }
          ]
        })
        .lean()
        .sort({ createdAt: 1 });

      // Formatear respuesta para incluir jugador y equipo en el nivel superior
      const estadisticasFormateadas = estadisticas.map(stat => ({
        ...stat,
        jugador: stat.jugadorPartido?.jugador || null,
        equipo: stat.jugadorPartido?.equipo || null,
        partido: stat.jugadorPartido?.partido || null
      }));

      res.json(estadisticasFormateadas);
    } catch (err) {
      console.error('Error al obtener estadísticas:', err);
      res.status(500).json({ error: err.message || 'Error al obtener estadísticas' });
    }
  }
);

// POST /api/estadisticas/jugador-partido
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { jugadorPartido, throws, hits, outs, catches, tipoCaptura, fuente } = req.body;
      if (!jugadorPartido) {
        return res.status(400).json({ error: 'jugadorPartido es obligatorio' });
      }

      const nuevo = new EstadisticasJugadorPartido({
        jugadorPartido,
        throws,
        hits,
        outs,
        catches,
        tipoCaptura: tipoCaptura || 'automatica',
        fuente: fuente || 'sistema',
        ultimaActualizacion: new Date(),
        creadoPor: req.user.uid,
      });

      const guardado = await nuevo.save();
      res.status(201).json(guardado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al crear estadísticas' });
    }
  }
);

// PUT /api/estadisticas/jugador-partido/:id
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorPartido.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrado' });

      const campos = ['throws', 'hits', 'outs', 'catches', 'tipoCaptura', 'fuente'];
      for (const c of campos) {
        if (Object.prototype.hasOwnProperty.call(req.body, c)) {
          item[c] = req.body[c];
        }
      }

      item.ultimaActualizacion = new Date();

      const actualizado = await item.save();
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al actualizar' });
    }
  }
);

// DELETE /api/estadisticas/jugador-partido/:id
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorPartido.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrado' });

      await item.deleteOne();
      res.json({ mensaje: 'Eliminado' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar' });
    }
  }
);

// En estadisticasJugadorPartido.js (backend)
router.get('/resumen-partido/:partidoId', verificarToken, async (req, res) => {
  try {
    const { partidoId } = req.params;
    
    // Primero obtener los JugadorPartido de este partido
    const jugadoresDelPartido = await JugadorPartido.find({ partido: partidoId }).select('_id');
    const jugadorPartidoIds = jugadoresDelPartido.map(jp => jp._id);
    
    // Obtener estadísticas de jugadores del partido
    const jugadoresStats = await EstadisticasJugadorPartido.find({
      jugadorPartido: { $in: jugadorPartidoIds }
    })
    .populate({
      path: 'jugadorPartido',
      populate: [
        { path: 'jugador', select: 'nombre apellido numero' },
        { path: 'equipo', select: 'nombre escudo' }
      ]
    });

    // Calcular estadísticas por equipo desde EstadisticasEquipoPartido
    const equiposStats = await EstadisticasEquipoPartido.find({ partido: partidoId })
      .populate('equipo', 'nombre escudo');

    // Formatear respuesta
    const equiposFormateados = equiposStats.map(equipo => ({
      _id: equipo.equipo._id,
      nombre: equipo.equipo.nombre,
      escudo: equipo.equipo.escudo,
      throws: equipo.throws || 0,
      hits: equipo.hits || 0,
      outs: equipo.outs || 0,
      catches: equipo.catches || 0,
      efectividad: equipo.throws > 0 ? ((equipo.hits / equipo.throws) * 100).toFixed(1) : 0,
      jugadores: equipo.jugadores || 0
    }));

    res.json({
      jugadores: jugadoresStats,
      equipos: equiposFormateados
    });

  } catch (error) {
    console.error('Error en resumen de partido:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas del partido' });
  }
});

// POST /api/estadisticas/jugador-partido/poblar-iniciales (solo para admin)
router.post('/poblar-iniciales', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    // Solo administradores pueden ejecutar esta migración
    if (!req.user.roles || !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: 'Solo administradores pueden ejecutar esta migración' });
    }

    const { poblarEstadisticasIniciales } = await import('../../utils/estadisticasAggregator.js');
    
    console.log('🚀 Iniciando migración de estadísticas iniciales...');
    await poblarEstadisticasIniciales();
    
    res.json({ 
      mensaje: 'Migración de estadísticas iniciales completada',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error en migración:', error);
    res.status(500).json({ error: 'Error en migración de estadísticas iniciales' });
  }
});

// GET /api/estadisticas/jugador-partido/debug (para debugging)
router.get('/debug', verificarToken, async (req, res) => {
  try {
    const { partido } = req.query;
    
    const debugData = {
      partidoId: partido,
      timestamp: new Date(),
      estadisticasJugadorSet: [],
      estadisticasJugadorPartido: [],
      estadisticasEquipoPartido: [],
      jugadorPartido: []
    };

    if (partido) {
      // Jugadores del partido
      debugData.jugadorPartido = await JugadorPartido.find({
        partido: partido
      }).populate('jugador', 'nombre apellido').populate('equipo', 'nombre').lean();

      // Estadísticas por set
      debugData.estadisticasJugadorSet = await EstadisticasJugadorSet.find({
        'jugadorPartido.partido': partido
      }).populate('jugadorPartido', 'jugador equipo').lean();

      // Estadísticas por jugador en partido
      const jugadorPartidoIds = debugData.jugadorPartido.map(jp => jp._id);
      debugData.estadisticasJugadorPartido = await EstadisticasJugadorPartido.find({
        jugadorPartido: { $in: jugadorPartidoIds }
      }).populate('jugadorPartido', 'jugador equipo').lean();

      // Estadísticas por equipo
      debugData.estadisticasEquipoPartido = await EstadisticasEquipoPartido.find({
        partido: partido
      }).populate('equipo', 'nombre').lean();
    }

    res.json(debugData);
  } catch (error) {
    console.error('Error en debug:', error);
    res.status(500).json({ error: 'Error en debug', details: error.message });
  }
});

// PUT /api/estadisticas/jugador-partido/convertir-a-automaticas/:partidoId
// Convierte todas las estadísticas manuales de un partido a automáticas
router.put('/convertir-a-automaticas/:partidoId', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { partidoId } = req.params;
    const { convertirEstadisticasManualesAAutomaticas } = await import('../../utils/estadisticasAggregator.js');

    console.log('🔄 Solicitud de conversión de estadísticas manuales a automáticas para partido:', partidoId);

    const resultado = await convertirEstadisticasManualesAAutomaticas(partidoId, req.user.uid);

    res.json({
      mensaje: 'Conversión completada',
      ...resultado
    });

  } catch (error) {
    console.error('❌ Error en conversión de estadísticas:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      detalle: error.message
    });
  }
});


export default router;
