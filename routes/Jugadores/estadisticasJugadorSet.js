import express from 'express';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import EstadisticasJugadorSet from '../../models/Jugador/EstadisticasJugadorSet.js';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';
import { actualizarEstadisticasJugadorPartido, actualizarEstadisticasEquipoPartido } from '../../utils/estadisticasAggregator.js';

const router = express.Router();

// GET /api/estadisticas/jugador-set
router.get(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { set, jugadorPartido, jugador, equipo } = req.query;
      
      // Construir filtro dinámico
      const filtro = {};
      if (set) filtro.set = set;
      if (jugadorPartido) filtro.jugadorPartido = jugadorPartido;
      if (jugador) filtro.jugador = jugador;
      if (equipo) filtro.equipo = equipo;

      const estadisticas = await EstadisticasJugadorSet.find(filtro)
        .populate({
          path: 'jugadorPartido',
          select: 'jugador equipo',
          populate: [
            { path: 'jugador', select: 'nombre apellido numero email' },
            { path: 'equipo', select: 'nombre escudo' }
          ]
        })
        .populate({
          path: 'set',
          select: 'numeroSet'
        })
        .lean()
        .sort({ createdAt: 1 });

      // Formatear respuesta para consistencia con otros endpoints
      const estadisticasFormateadas = estadisticas.map(stat => ({
        ...stat,
        jugador: stat.jugadorPartido?.jugador || null,
        equipo: stat.jugadorPartido?.equipo || null
      }));

      // Log opcional para debug
      // if (estadisticas.length > 0) {
      //   console.log('📊 Estadísticas devueltas:', estadisticas.length);
      // }

      res.json(estadisticasFormateadas);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Error al obtener estadísticas' });
    }
  }
);

// POST /api/estadisticas/jugador-set
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { set, jugadorPartido, jugador, equipo, throws, hits, outs, catches } = req.body;
      if (!set || !jugadorPartido || !jugador || !equipo) {
        return res.status(400).json({ error: 'set, jugadorPartido, jugador y equipo son obligatorios' });
      }

      const nuevo = new EstadisticasJugadorSet({
        set,
        jugadorPartido,
        jugador,
        equipo,
        throws,
        hits,
        outs,
        catches,
        creadoPor: req.user.uid,
      });

      const guardado = await nuevo.save();
      
      // Actualizar estadísticas agregadas automáticamente
      try {
        // 1. Actualizar totales del jugador en el partido
        await actualizarEstadisticasJugadorPartido(jugadorPartido, req.user.uid, false);
        
        // 2. Obtener el partido del jugador para actualizar estadísticas del equipo
        const jugPartido = await JugadorPartido.findById(jugadorPartido);
        if (jugPartido) {
          await actualizarEstadisticasEquipoPartido(jugPartido.partido, equipo, req.user.uid);
        }
        
        console.log('✅ Estadísticas agregadas actualizadas automáticamente');
      } catch (aggError) {
        console.error('⚠️ Error actualizando estadísticas agregadas:', aggError);
        // No falla la petición principal, solo log el error
      }
      
      res.status(201).json(guardado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al crear estadísticas de set' });
    }
  }
);

// PUT /api/estadisticas/jugador-set/:id
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorSet.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrado' });

      const campos = ['throws', 'hits', 'outs', 'catches'];
      for (const c of campos) {
        if (Object.prototype.hasOwnProperty.call(req.body, c)) {
          item[c] = req.body[c];
        }
      }

      const actualizado = await item.save();
      
      // Actualizar estadísticas agregadas automáticamente
      try {
        // 1. Actualizar totales del jugador en el partido
        await actualizarEstadisticasJugadorPartido(item.jugadorPartido, req.user.uid, false);
        
        // 2. Obtener el partido del jugador para actualizar estadísticas del equipo
        const jugPartido = await JugadorPartido.findById(item.jugadorPartido);
        if (jugPartido) {
          await actualizarEstadisticasEquipoPartido(jugPartido.partido, item.equipo, req.user.uid);
        }
        
        console.log('✅ Estadísticas agregadas actualizadas automáticamente');
      } catch (aggError) {
        console.error('⚠️ Error actualizando estadísticas agregadas:', aggError);
        // No falla la petición principal, solo log el error
      }
      
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al actualizar' });
    }
  }
);

// DELETE /api/estadisticas/jugador-set/:id
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorSet.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrado' });

      // Guardar referencias antes de eliminar
      const jugadorPartidoId = item.jugadorPartido;
      const equipoId = item.equipo;

      await item.deleteOne();
      
      // Actualizar estadísticas agregadas automáticamente
      try {
        // 1. Actualizar totales del jugador en el partido
        await actualizarEstadisticasJugadorPartido(jugadorPartidoId, req.user.uid, false);
        
        // 2. Obtener el partido del jugador para actualizar estadísticas del equipo
        const jugPartido = await JugadorPartido.findById(jugadorPartidoId);
        if (jugPartido) {
          await actualizarEstadisticasEquipoPartido(jugPartido.partido, equipoId, req.user.uid);
        }
        
        console.log('✅ Estadísticas agregadas recalculadas después de eliminar');
      } catch (aggError) {
        console.error('⚠️ Error actualizando estadísticas agregadas:', aggError);
        // No falla la petición principal, solo log el error
      }
      
      res.json({ mensaje: 'Eliminado' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar' });
    }
  }
);

// GET /api/estadisticas/jugador-set/resumen-partido/:partidoId
router.get('/resumen-partido/:partidoId', verificarToken, async (req, res) => {
  try {
    const { partidoId } = req.params;

    // Obtener sets del partido
    const SetPartido = (await import('../../models/Partido/SetPartido.js')).default;
    const setsDelPartido = await SetPartido.find({ partido: partidoId })
      .populate('ganadorSet', 'nombre')
      .sort({ numeroSet: 1 });

    // Para cada set, obtener estadísticas de jugadores
    const setsConEstadisticas = await Promise.all(
      setsDelPartido.map(async (set) => {
        const estadisticasSet = await EstadisticasJugadorSet.find({
          set: set._id
        })
        .populate({
          path: 'jugador',
          select: 'nombre apellido numero'
        })
        .populate({
          path: 'equipo',
          select: 'nombre escudo'
        })
        .populate({
          path: 'jugadorPartido',
          select: 'jugador equipo',
          populate: [
            {
              path: 'jugador',
              select: 'nombre apellido numero'
            },
            {
              path: 'equipo',
              select: 'nombre escudo'
            }
          ]
        });

        return {
          ...set.toObject(),
          estadisticas: estadisticasSet.map(stat => ({
            ...stat,
            jugador: stat.jugadorPartido?.jugador || null,
            equipo: stat.jugadorPartido?.equipo || null
          }))
        };
      })
    );

    res.json({
      partido: partidoId,
      sets: setsConEstadisticas
    });

  } catch (error) {
    console.error('Error en resumen de sets del partido:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas por set del partido' });
  }
});

export default router;

