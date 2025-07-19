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
    const { jugadorEquipo, participacionTemporada } = req.body;
    if (!jugadorEquipo || !participacionTemporada) {
      return res.status(400).json({ error: 'jugador y participacionTemporada son requeridos' });
    }
    // 1. Obtener jugador desde jugadorEquipo
    const je = await JugadorEquipo.findById(jugadorEquipo).select('jugador');
    if (!je) {
      return res.status(400).json({ error: 'jugadorEquipo no válido' });
    }
    const jugador = je.jugador;

    // 2. Obtener competencia desde participacionTemporada
    const competenciaId = await obtenerCompetenciaDesdeParticipacionTemporada(participacionTemporada);
    if (!competenciaId) {
      return res.status(400).json({ error: 'No se pudo obtener la competencia desde la participación temporada' });
    }

    // 3. Buscar o crear JugadorCompetencia
    const jugadorCompetencia = await JugadorCompetencia.findOneAndUpdate(
      { jugador, competencia: competenciaId },
      { jugador, competencia: competenciaId },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Crear nuevo JugadorTemporada
    const nuevo = new JugadorTemporada({
      jugadorEquipo,
      participacionTemporada,
      estado: estado || 'aceptado',
      rol: rol || 'jugador',
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
