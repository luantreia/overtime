import express from 'express';
import ParticipacionTemporada from '../models/ParticipacionTemporada.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

// GET /api/participacion-temporada - Listar todas o con filtros
router.get('/', verificarToken, async (req, res) => {
  try {
    const filtro = {};
    if (req.query.equipoCompetencia) filtro.equipoCompetencia = req.query.equipoCompetencia;
    if (req.query.temporada) filtro.temporada = req.query.temporada;
    const resultados = await ParticipacionTemporada.find(filtro)
      .populate('equipoCompetencia')
      .populate('temporada')
      .populate('creadoPor');
    res.json(resultados);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener participaciones', error: err.message });
  }
});

// GET /api/participacion-temporada/:id
router.get('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const participacion = await ParticipacionTemporada.findById(req.params.id)
      .populate('equipoCompetencia')
      .populate('temporada')
      .populate('creadoPor');
    if (!participacion) return res.status(404).json({ message: 'No encontrada' });
    res.json(participacion);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener participación', error: err.message });
  }
});

// POST /api/participacion-temporada
router.post('/', verificarToken, async (req, res) => {
  try {
    const nueva = new ParticipacionTemporada({
      ...req.body,
      creadoPor: req.usuario?.id || 'sistema',
    });
    await nueva.save();
    res.status(201).json(nueva);
  } catch (err) {
    res.status(400).json({ message: 'Error al crear participación', error: err.message });
  }
});

// PUT /api/participacion-temporada/:id
router.put('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const actualizada = await ParticipacionTemporada.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!actualizada) return res.status(404).json({ message: 'No encontrada' });
    res.json(actualizada);
  } catch (err) {
    res.status(400).json({ message: 'Error al actualizar participación', error: err.message });
  }
});

// DELETE /api/participacion-temporada/:id
router.delete('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const eliminada = await ParticipacionTemporada.findByIdAndDelete(req.params.id);
    if (!eliminada) return res.status(404).json({ message: 'No encontrada' });
    res.json({ message: 'Participación eliminada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar participación', error: err.message });
  }
});

export default router;
