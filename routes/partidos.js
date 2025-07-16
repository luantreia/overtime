import express from 'express';
import Partido from '../models/Partido/Partido.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

// GET /api/partidos - Listar partidos (opcionalmente filtrados por fase o competencia)
router.get('/', verificarToken, async (req, res) => {
  try {
    const { fase, competencia } = req.query;
    const filtro = {};
    if (fase) filtro.fase = fase;
    if (competencia) filtro.competencia = competencia;

    const partidos = await Partido.find(filtro)
      .populate('competencia fase equipoLocal equipoVisitante equipoCompetenciaLocal equipoCompetenciaVisitante')
      .sort({ fecha: 1 });

    res.json(partidos);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener partidos', error: err.message });
  }
});

// GET /api/partidos/:id - Obtener un partido
router.get('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const partido = await Partido.findById(req.params.id)
      .populate('competencia fase equipoLocal equipoVisitante equipoCompetenciaLocal equipoCompetenciaVisitante');

    if (!partido) return res.status(404).json({ message: 'Partido no encontrado' });
    res.json(partido);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener el partido', error: err.message });
  }
});

// POST /api/partidos - Crear partido
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const data = {
      ...req.body,
      creadoPor: req.usuarioId,
    };

    const nuevoPartido = new Partido(data);
    await nuevoPartido.save();
    res.status(201).json(nuevoPartido);
  } catch (err) {
    res.status(400).json({ message: 'Error al crear el partido', error: err.message });
  }
});

// PUT /api/partidos/:id - Editar partido
router.put('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const partido = await Partido.findById(req.params.id);
    if (!partido) return res.status(404).json({ message: 'Partido no encontrado' });

    // Validar si el usuario es admin del partido o global
    if (
      partido.creadoPor !== req.usuarioId &&
      !partido.administradores.includes(req.usuarioId) &&
      req.rol !== 'admin'
    ) {
      return res.status(403).json({ message: 'No tiene permiso para editar este partido' });
    }

    Object.assign(partido, req.body);
    await partido.save();
    res.json(partido);
  } catch (err) {
    res.status(400).json({ message: 'Error al actualizar el partido', error: err.message });
  }
});

// DELETE /api/partidos/:id - Eliminar partido
router.delete('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const partido = await Partido.findById(req.params.id);
    if (!partido) return res.status(404).json({ message: 'Partido no encontrado' });

    if (
      partido.creadoPor !== req.usuarioId &&
      !partido.administradores.includes(req.usuarioId) &&
      req.rol !== 'admin'
    ) {
      return res.status(403).json({ message: 'No tiene permiso para eliminar este partido' });
    }

    await partido.deleteOne();
    res.json({ message: 'Partido eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar el partido', error: err.message });
  }
});

export default router;
