import express from 'express';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import EstadisticasJugadorSet from '../../models/Jugador/EstadisticasJugadorSet.js';

const router = express.Router();

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

      await item.deleteOne();
      res.json({ mensaje: 'Eliminado' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar' });
    }
  }
);

export default router;

