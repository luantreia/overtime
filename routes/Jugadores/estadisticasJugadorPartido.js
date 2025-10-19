import express from 'express';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import EstadisticasJugadorPartido from '../../models/Jugador/EstadisticasJugadorPartido.js';

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
      const { jugadorPartido, throws, hits, outs, catches } = req.body;
      if (!jugadorPartido) {
        return res.status(400).json({ error: 'jugadorPartido es obligatorio' });
      }

      const nuevo = new EstadisticasJugadorPartido({
        jugadorPartido,
        throws,
        hits,
        outs,
        catches,
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

      const campos = ['throws', 'hits', 'outs', 'catches'];
      for (const c of campos) {
        if (Object.prototype.hasOwnProperty.call(req.body, c)) {
          item[c] = req.body[c];
        }
      }

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
    
    // Obtener estadísticas de jugadores
    const jugadoresStats = await EstadisticasJugadorPartido.find({
      'jugadorPartido.partido': partidoId
    })
    .populate('jugador', 'nombre apellido numero')
    .populate('equipo', 'nombre escudo');

    // Calcular estadísticas por equipo
    const equiposMap = new Map();

    jugadoresStats.forEach(stat => {
      const equipoId = stat.equipo._id.toString();
      
      if (!equiposMap.has(equipoId)) {
        equiposMap.set(equipoId, {
          _id: equipoId,
          nombre: stat.equipo.nombre,
          escudo: stat.equipo.escudo,
          jugadores: 0,
          throws: 0,
          hits: 0,
          outs: 0,
          catches: 0,
          efectividad: 0
        });
      }

      const equipo = equiposMap.get(equipoId);
      equipo.jugadores += 1;
      equipo.throws += stat.throws || 0;
      equipo.hits += stat.hits || 0;
      equipo.outs += stat.outs || 0;
      equipo.catches += stat.catches || 0;
    });

    // Calcular efectividad (ejemplo: hits/throws)
    for (const equipo of equiposMap.values()) {
      equipo.efectividad = equipo.throws > 0 
        ? ((equipo.hits / equipo.throws) * 100).toFixed(1) 
        : 0;
    }

    res.json({
      jugadores: jugadoresStats,
      equipos: Array.from(equiposMap.values())
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

export default router;

