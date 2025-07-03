// routes/participacionFase.js
import express from 'express';
import ParticipacionFase from '../models/ParticipacionFase.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

// GET /participaciones - listar todas o filtrar por fase, equipoCompetencia, grupo, etc
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.fase) filter.fase = req.query.fase;
    if (req.query.equipoCompetencia) filter.equipoCompetencia = req.query.equipoCompetencia;
    if (req.query.grupo) filter.grupo = req.query.grupo;
    if (req.query.division) filter.division = req.query.division;

    if (req.query.competenciaId) {
      // Filtramos participaciones que tengan fase con competencia = competenciaId
      const competenciaObjectId = new mongoose.Types.ObjectId(req.query.competenciaId);

      const participaciones = await ParticipacionFase.aggregate([
        { $match: filter }, // aplica otros filtros
        {
          $lookup: {
            from: 'fases', // nombre exacto de la colección fases en la DB
            localField: 'fase',
            foreignField: '_id',
            as: 'faseData',
          }
        },
        { $unwind: '$faseData' },
        {
          $match: { 'faseData.competencia': competenciaObjectId }
        },
        {
          $sort: { puntos: -1, diferenciaPuntos: -1, partidosGanados: -1 }
        },
        {
          $project: {
            equipoCompetencia: 1,
            fase: 1,
            grupo: 1,
            division: 1,
            puntos: 1,
            diferenciaPuntos: 1,
            partidosGanados: 1,
            // incluye campos que necesites
          }
        }
      ]);

      return res.json(participaciones);
    }

    // Si no hay competenciaId, hacemos la consulta normal con populate
    const participaciones = await ParticipacionFase.find(filter)
      .populate({
        path: 'equipoCompetencia',
        populate: { path: 'equipo', select: 'nombre' }
      })
      .populate('fase', 'nombre tipo')
      .sort({ puntos: -1, diferenciaPuntos: -1, partidosGanados: -1 })
      .lean();

    res.json(participaciones);
  } catch (error) {
    console.error('Error al obtener participaciones:', error);
    res.status(500).json({ error: 'Error al obtener participaciones' });
  }
});


// GET /participaciones/:id - obtener participación por id
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const participacion = await ParticipacionFase.findById(req.params.id)
      .populate({
        path: 'equipoCompetencia',
        populate: { path: 'equipo', select: 'nombre' }
      })
      .populate('fase', 'nombre tipo')
      .lean();

    if (!participacion) return res.status(404).json({ error: 'Participación no encontrada' });
    res.json(participacion);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener participación' });
  }
});

// POST /participaciones - crear nueva participación (autenticado)
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { equipoCompetencia, fase, grupo, division } = req.body;

      if (!equipoCompetencia || !fase) {
        return res.status(400).json({ error: 'Se requieren equipoCompetencia y fase' });
      }

      // Podrías agregar validaciones extra aquí (p. ej. validar que la fase exista)

      const nuevaParticipacion = new ParticipacionFase({
        ...req.body,
      });

      await nuevaParticipacion.save();
      res.status(201).json(nuevaParticipacion);
    } catch (error) {
      console.error('Error al crear participación:', error);
      res.status(400).json({ error: error.message || 'Error al crear participación' });
    }
  }
);

// PUT /participaciones/:id - actualizar participación (solo admin o creador)
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(ParticipacionFase, 'participacionFase'),
  async (req, res) => {
    try {
      Object.assign(req.participacionFase, req.body);
      const actualizado = await req.participacionFase.save();
      res.json(actualizado);
    } catch (error) {
      console.error('Error al actualizar participación:', error);
      res.status(400).json({ error: error.message || 'Error al actualizar participación' });
    }
  }
);

// DELETE /participaciones/:id - eliminar participación (solo admin o creador)
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(ParticipacionFase, 'participacionFase'),
  async (req, res) => {
    try {
      await req.participacionFase.deleteOne();
      res.json({ mensaje: 'Participación eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: 'Error al eliminar participación' });
    }
  }
);

// Middleware para cargar la participación y agregar a req.participacionFase
router.param('id', async (req, res, next, id) => {
  try {
    const participacion = await ParticipacionFase.findById(id);
    if (!participacion) return res.status(404).json({ error: 'Participación no encontrada' });
    req.participacionFase = participacion;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar participación' });
  }
});

export default router;
