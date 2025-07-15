import express from 'express';
import  JugadorFase  from '../../models/Jugador/JugadorFase.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();

// GET /api/jugador-fase?jugadorTemporada=...&participacionFase=...
router.get('/', async (req, res) => {
  const { jugadorTemporada, participacionFase } = req.query;
  const filtro = {};
  if (jugadorTemporada) filtro.jugadorTemporada = jugadorTemporada;
  if (participacionFase) filtro.participacionFase = participacionFase;

  try {
    const items = await JugadorFase.find(filtro).lean();
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// GET /:id
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const item = await JugadorFase.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Error al obtener' });
  }
});

// POST
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const nuevo = new JugadorFase({
      ...req.body,
      creadoPor: req.user.uid,
    });
    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorFase.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    Object.assign(item, req.body);
    const actualizado = await item.save();
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorFase.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    await item.deleteOne();
    res.json({ mensaje: 'Eliminado' });
  } catch {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
