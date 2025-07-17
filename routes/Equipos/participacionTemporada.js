import express from 'express';
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';
import Equipo from '../../models/Equipo/Equipo.js';
import Temporada from '../../models/Competencia/Temporada.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { body, query, validationResult } from 'express-validator';

const router = express.Router();

// Middleware para chequear errores de validación express-validator
const validarCampos = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/participacion-temporada?temporada=&equipo=&page=&limit=&sort=
router.get(
  '/',
  verificarToken,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('sort').optional().isString(),
    query('temporada').optional().isMongoId(),
    query('equipo').optional().isMongoId(),
  ],
  validarCampos,
  async (req, res) => {
    try {
      const { temporada, equipo, page = 1, limit = 20, sort = '-createdAt' } = req.query;
      const filtro = {};
      if (temporada) filtro.temporada = temporada;
      if (equipo) filtro.equipo = equipo;

      const skip = (page - 1) * limit;

      const [participaciones, total] = await Promise.all([
        ParticipacionTemporada.find(filtro)
          .populate('equipo', 'nombre escudo tipo pais')
          .populate('temporada', 'nombre fechaInicio fechaFin competencia')
          .populate('creadoPor', 'nombre email')
          .sort(sort)
          .skip(skip)
          .limit(limit),
        ParticipacionTemporada.countDocuments(filtro),
      ]);

      res.json({
        data: participaciones,
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Error al obtener participaciones', error: err.message });
    }
  }
);

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
router.post(
  '/',
  verificarToken,
  [
    body('equipo').notEmpty().isMongoId(),
    body('temporada').notEmpty().isMongoId(),
    body('estado').optional().isIn(['activo', 'baja', 'expulsado']),
    body('observaciones').optional().isString().trim().isLength({ max: 500 }),
  ],
  validarCampos,
  async (req, res) => {
    try {
      const { equipo, temporada } = req.body;

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
        creadoPor: req.usuario?.id || 'sistema',
      });

      await nueva.save();
      res.status(201).json(nueva);
    } catch (err) {
      console.error(err);
      res.status(400).json({ message: 'Error al crear participación', error: err.message });
    }
  }
);

// PUT /api/participacion-temporada/:id
router.put(
  '/:id',
  verificarToken,
  validarObjectId,
  [
    body('equipo').optional().isMongoId(),
    body('temporada').optional().isMongoId(),
    body('estado').optional().isIn(['activo', 'baja', 'expulsado']),
    body('observaciones').optional().isString().trim().isLength({ max: 500 }),
  ],
  validarCampos,
  async (req, res) => {
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
  }
);

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
