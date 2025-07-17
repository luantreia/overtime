import express from 'express';
import mongoose from 'mongoose';
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';
import Equipo from '../../models/Equipo/Equipo.js';
import Temporada from '../../models/Competencia/Temporada.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();
const { Types } = mongoose;

// Middleware para validar manualmente campos en query y body
function validarCamposManual(req, res, next) {
  // Validar ObjectId en query params si están presentes
  if (req.query.temporada && !Types.ObjectId.isValid(req.query.temporada)) {
    return res.status(400).json({ message: 'temporada inválida' });
  }
  if (req.query.equipo && !Types.ObjectId.isValid(req.query.equipo)) {
    return res.status(400).json({ message: 'equipo inválido' });
  }
  // Validar ObjectId en body si están presentes
  if (req.body.equipo && !Types.ObjectId.isValid(req.body.equipo)) {
    return res.status(400).json({ message: 'equipo inválido' });
  }
  if (req.body.temporada && !Types.ObjectId.isValid(req.body.temporada)) {
    return res.status(400).json({ message: 'temporada inválida' });
  }
  // Validar estado
  const estadosValidos = ['activo', 'baja', 'expulsado'];
  if (req.body.estado && !estadosValidos.includes(req.body.estado)) {
    return res.status(400).json({ message: 'estado inválido' });
  }
  // Validar observaciones
  if (req.body.observaciones && typeof req.body.observaciones !== 'string') {
    return res.status(400).json({ message: 'observaciones debe ser texto' });
  }
  if (req.body.observaciones && req.body.observaciones.length > 500) {
    return res.status(400).json({ message: 'observaciones demasiado largo' });
  }

  next();
}

// GET /api/participacion-temporada?temporada=&equipo=
router.get('/', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { temporada, equipo } = req.query;
    const filtro = {};
    if (temporada) filtro.temporada = temporada;
    if (equipo) filtro.equipo = equipo;

    const participaciones = await ParticipacionTemporada.find(filtro)
      .populate('equipo', 'nombre escudo tipo pais')
      .populate('temporada', 'nombre fechaInicio fechaFin competencia')
      .populate('creadoPor', 'nombre email')
      .sort('-createdAt');

    res.json(participaciones);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener participaciones', error: err.message });
  }
});


// GET /api/participacion-temporada/:id
router.get('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const participacion = await ParticipacionTemporada.findById(req.params.id)
      .populate('equipo', 'nombre escudo tipo pais')
      .populate('temporada', 'nombre fechaInicio fechaFin competencia')
      .populate('creadoPor', 'nombre email');

    if (!participacion) {
      return res.status(404).json({ message: 'Participación no encontrada' });
    }

    res.json(participacion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al buscar participación', error: err.message });
  }
});

// POST /api/participacion-temporada
router.post('/', verificarToken, validarCamposManual, async (req, res) => {
  try {
    console.log('POST /participacion-temporada body:', req.body);

    const { equipo, temporada } = req.body;

    if (!equipo || !temporada) {
      return res.status(400).json({ message: 'equipo y temporada son obligatorios' });
    }

    // Validar que equipo y temporada existen
    const [equipoDB, temporadaDB] = await Promise.all([
      Equipo.findById(equipo),
      Temporada.findById(temporada),
    ]);
    if (!equipoDB) return res.status(400).json({ message: 'Equipo no encontrado' });
    if (!temporadaDB) return res.status(400).json({ message: 'Temporada no encontrada' });

    // Verificar que no exista ya una participación con el mismo equipo-temporada
    const existe = await ParticipacionTemporada.findOne({ equipo, temporada });
    if (existe) {
      return res.status(409).json({ message: 'Ya existe una participación para este equipo y temporada' });
    }

    const nueva = new ParticipacionTemporada({
      ...req.body,
        creadoPor: req.user?.uid || 'sistema',
    });

    await nueva.save();
    res.status(201).json(nueva);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Error al crear participación', error: err.message });
  }
});

// PUT /api/participacion-temporada/:id
router.put('/:id', verificarToken, validarObjectId, validarCamposManual, async (req, res) => {
  try {
    const item = await ParticipacionTemporada.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Participación no encontrada' });

    // Si actualizan equipo o temporada validar que existan
    if (req.body.equipo) {
      const equipoDB = await Equipo.findById(req.body.equipo);
      if (!equipoDB) return res.status(400).json({ message: 'Equipo no encontrado' });
    }
    if (req.body.temporada) {
      const temporadaDB = await Temporada.findById(req.body.temporada);
      if (!temporadaDB) return res.status(400).json({ message: 'Temporada no encontrada' });
    }

    // Actualizar
    Object.assign(item, req.body);
    const actualizado = await item.save();
    res.json(actualizado);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Error al actualizar participación', error: err.message });
  }
});

// DELETE /api/participacion-temporada/:id
router.delete('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const eliminada = await ParticipacionTemporada.findByIdAndDelete(req.params.id);
    if (!eliminada) {
      return res.status(404).json({ message: 'Participación no encontrada' });
    }

    res.json({ message: 'Participación eliminada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar participación', error: err.message });
  }
});

export default router;
