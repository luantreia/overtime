import express from 'express';
import  JugadorCompetencia from '../../models/Jugador/JugadorCompetencia.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();

// GET /api/jugador-competencia?competencia=...
router.get('/', async (req, res) => {
  const { competencia } = req.query;
  const filtro = {};
  if (competencia) filtro.competencia = competencia;

  try {
    const items = await JugadorCompetencia.find(filtro)
      .populate({
        path: 'jugador',
        select: 'nombre apellido foto',
      })
      .lean();

    res.json(items);
  } catch (err) {
    console.error('Error al obtener jugadores competencia', err);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// GET /api/jugador-competencia/:id
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const item = await JugadorCompetencia.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Error al obtener' });
  }
});

// POST /api/jugador-competencia
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const nuevo = new JugadorCompetencia({
      ...req.body,
      creadoPor: req.user.uid,
    });
    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/jugador-competencia/:id
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorCompetencia.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    Object.assign(item, req.body);
    const actualizado = await item.save();
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/jugador-competencia/:id
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorCompetencia.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    await item.deleteOne();
    res.json({ mensaje: 'Eliminado' });
  } catch {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
