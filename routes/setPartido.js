//  /routes/setPartido.js

import express from 'express';
import SetPartido from '../models/SetPartido.js';
import Partido from '../models/Partido.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

// GET /api/set-partido?partido=...
router.get('/', async (req, res) => {
  const { partido } = req.query;
  if (!partido) return res.status(400).json({ error: 'Falta el parámetro partido' });

  try {
    const sets = await SetPartido.find({ partido }).sort('numeroSet').lean();
    res.json(sets);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los sets' });
  }
});

// GET /api/set-partido/:id
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const set = await SetPartido.findById(req.params.id).lean();
    if (!set) return res.status(404).json({ error: 'Set no encontrado' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el set' });
  }
});

// POST /api/set-partido
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { partido, numeroSet } = req.body;
      if (!partido || !numeroSet) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
      }

      // Validar que el partido exista
      const partidoObj = await Partido.findById(partido);
      if (!partidoObj) return res.status(404).json({ error: 'Partido no encontrado' });

      const nuevoSet = new SetPartido({
        ...req.body,
        creadoPor: req.user.uid,
      });

      const guardado = await nuevoSet.save();
      res.status(201).json(guardado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al crear set' });
    }
  }
);

// PUT /api/set-partido/:id
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const set = await SetPartido.findById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Set no encontrado' });

      // TODO: Podés agregar validación de permisos acá si querés

      Object.assign(set, req.body);
      const actualizado = await set.save();
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al actualizar el set' });
    }
  }
);

// DELETE /api/set-partido/:id
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const set = await SetPartido.findById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Set no encontrado' });

      // TODO: Podés validar si el usuario es creador o admin del partido

      await set.deleteOne();
      res.json({ mensaje: 'Set eliminado correctamente' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar el set' });
    }
  }
);

export default router;
