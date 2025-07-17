import express from 'express';
import JugadorTemporada from '../../models/Jugador/JugadorTemporada.js';
import JugadorCompetencia from '../../models/Jugador/JugadorCompetencia.js';
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();

// Helper para obtener competencia desde participacionTemporada
async function obtenerCompetenciaDesdeParticipacionTemporada(participacionTemporadaId) {
  const participacion = await ParticipacionTemporada.findById(participacionTemporadaId).populate({
    path: 'equipo',
    populate: {
      path: 'competencia'
    }
  });
  return participacion?.equipo?.competencia?._id || null;
}

// GET /api/jugador-temporada?jugadorCompetencia=...&participacionTemporada=...
router.get('/', async (req, res) => {
  try {
    const filtro = {};
    if (req.query.jugadorCompetencia) filtro.jugadorCompetencia = req.query.jugadorCompetencia;
    if (req.query.participacionTemporada) filtro.participacionTemporada = req.query.participacionTemporada;

    const items = await JugadorTemporada.find(filtro).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// GET /api/jugador-temporada/:id
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const item = await JugadorTemporada.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Error al obtener' });
  }
});

// POST /api/jugador-temporada
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { jugador, participacionTemporada } = req.body;
    if (!jugador || !participacionTemporada) {
      return res.status(400).json({ error: 'jugador y participacionTemporada son requeridos' });
    }

    // Obtener competencia desde participacionTemporada
    const competenciaId = await obtenerCompetenciaDesdeParticipacionTemporada(participacionTemporada);
    if (!competenciaId) {
      return res.status(400).json({ error: 'No se pudo obtener la competencia desde la participación temporada' });
    }

    // Buscar o crear JugadorCompetencia
    const jugadorCompetencia = await JugadorCompetencia.findOneAndUpdate(
      { jugador, competencia: competenciaId },
      { jugador, competencia: competenciaId },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Crear JugadorTemporada con jugadorCompetencia
    const nuevo = new JugadorTemporada({
      ...req.body,
      jugadorCompetencia: jugadorCompetencia._id,
      creadoPor: req.user.uid,
    });

    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/jugador-temporada/:id
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorTemporada.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    Object.assign(item, req.body);
    const actualizado = await item.save();
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/jugador-temporada/:id
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorTemporada.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    await item.deleteOne();
    res.json({ mensaje: 'Eliminado' });
  } catch {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
