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
        const { default: JugadorPartido } = await import('../../models/Partido/JugadorPartido.js');
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

export default router;

