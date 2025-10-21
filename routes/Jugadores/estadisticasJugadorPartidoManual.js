import express from 'express';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import EstadisticasJugadorPartidoManual from '../../models/Jugador/EstadisticasJugadorPartidoManual.js';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';

const router = express.Router();

// GET /api/estadisticas/jugador-partido-manual
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
        const { default: JugadorPartido } = await import('../../models/Jugador/JugadorPartido.js');
        const jugadoresDelPartido = await JugadorPartido.find({ partido }).select('_id');
        const idsJugadorPartido = jugadoresDelPartido.map(jp => jp._id);
        filtro.jugadorPartido = { $in: idsJugadorPartido };
      }

      if (jugadorPartido) filtro.jugadorPartido = jugadorPartido;
      if (jugador) filtro.jugador = jugador;
      if (equipo) filtro.equipo = equipo;

      const estadisticas = await EstadisticasJugadorPartidoManual.find(filtro)
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
      console.error('Error al obtener estadísticas manuales:', err);
      res.status(500).json({ error: err.message || 'Error al obtener estadísticas manuales' });
    }
  }
);

// POST /api/estadisticas/jugador-partido-manual
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { jugadorPartido, throws, hits, outs, catches, notas } = req.body;
      if (!jugadorPartido) {
        return res.status(400).json({ error: 'jugadorPartido es obligatorio' });
      }

      const nuevo = new EstadisticasJugadorPartidoManual({
        jugadorPartido,
        throws,
        hits,
        outs,
        catches,
        notas,
        ultimaActualizacion: new Date(),
        creadoPor: req.user.uid,
      });

      const guardado = await nuevo.save();
      res.status(201).json(guardado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al crear estadísticas manuales' });
    }
  }
);

// PUT /api/estadisticas/jugador-partido-manual/:id
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorPartidoManual.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Estadísticas manuales no encontradas' });

      const campos = ['throws', 'hits', 'outs', 'catches', 'notas'];
      for (const c of campos) {
        if (Object.prototype.hasOwnProperty.call(req.body, c)) {
          item[c] = req.body[c];
        }
      }

      item.ultimaActualizacion = new Date();
      item.version = (item.version || 1) + 1; // Incrementar versión

      const actualizado = await item.save();
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al actualizar estadísticas manuales' });
    }
  }
);

// DELETE /api/estadisticas/jugador-partido-manual/:id
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorPartidoManual.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Estadísticas manuales no encontradas' });

      await item.deleteOne();
      res.json({ mensaje: 'Estadísticas manuales eliminadas' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar estadísticas manuales' });
    }
  }
);

// GET /api/estadisticas/jugador-partido-manual/resumen-partido/:partidoId
router.get('/resumen-partido/:partidoId', verificarToken, async (req, res) => {
  try {
    const { partidoId } = req.params;
    console.log('🔍 Buscando estadísticas manuales para partido:', partidoId);

    // Primero obtener los JugadorPartido de este partido
    const jugadoresDelPartido = await JugadorPartido.find({ partido: partidoId }).select('_id');
    const jugadorPartidoIds = jugadoresDelPartido.map(jp => jp._id);
    console.log('👥 Jugadores del partido encontrados:', jugadorPartidoIds.length);

    // Obtener estadísticas manuales de jugadores del partido
    const jugadoresStats = await EstadisticasJugadorPartidoManual.find({
      jugadorPartido: { $in: jugadorPartidoIds }
    })
    .populate({
      path: 'jugadorPartido',
      populate: [
        { path: 'jugador', select: 'nombre apellido numero' },
        { path: 'equipo', select: 'nombre escudo' }
      ]
    });

    console.log('📊 Estadísticas manuales encontradas:', jugadoresStats.length);
    console.log('📈 Primera estadística:', jugadoresStats[0] || 'Ninguna');

    // Calcular estadísticas por equipo agregando las estadísticas de jugadores
    const equiposMap = {};

    jugadoresStats.forEach(stat => {
      const equipo = stat.jugadorPartido?.equipo;
      console.log('🏆 Procesando estadística para equipo:', equipo?.nombre || 'Sin equipo');
      if (equipo) {
        const equipoId = equipo._id || equipo;

        if (!equiposMap[equipoId]) {
          equiposMap[equipoId] = {
            _id: equipoId,
            nombre: equipo.nombre,
            escudo: equipo.escudo,
            throws: 0,
            hits: 0,
            outs: 0,
            catches: 0,
            jugadores: 0
          };
        }

        equiposMap[equipoId].throws += stat.throws || 0;
        equiposMap[equipoId].hits += stat.hits || 0;
        equiposMap[equipoId].outs += stat.outs || 0;
        equiposMap[equipoId].catches += stat.catches || 0;
        equiposMap[equipoId].jugadores += 1;
      }
    });

    // Calcular efectividad para cada equipo
    Object.values(equiposMap).forEach(equipo => {
      equipo.efectividad = equipo.throws > 0 ? ((equipo.hits / equipo.throws) * 100).toFixed(1) : 0;
    });

    const equiposStats = Object.values(equiposMap);
    console.log('🏆 Estadísticas de equipos calculadas:', equiposStats);

    res.json({
      jugadores: jugadoresStats,
      equipos: equiposStats
    });

  } catch (error) {
    console.error('Error en resumen de estadísticas manuales:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas manuales del partido' });
  }
});

export default router;
