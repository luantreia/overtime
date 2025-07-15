// routes/participacionFase.js
import express from 'express';
import ParticipacionFase from '../models/Equipo/ParticipacionFase.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import mongoose from 'mongoose';

const router = express.Router();

// GET /participaciones - listar todas o filtrar por fase, equipoCompetencia, grupo, etc

// ...

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.fase) filter.fase = req.query.fase;
    if (req.query.equipoCompetencia) filter.equipoCompetencia = req.query.equipoCompetencia;
    if (req.query.grupo) filter.grupo = req.query.grupo;
    if (req.query.division) filter.division = req.query.division;

    if (req.query.competenciaId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.competenciaId)) {
        return res.status(400).json({ error: 'competenciaId inválido' });
      }
      const competenciaObjectId = new mongoose.Types.ObjectId(req.query.competenciaId);

      const participaciones = await ParticipacionFase.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'fases',
            localField: 'fase',
            foreignField: '_id',
            as: 'faseData',
          }
        },
        { $unwind: '$faseData' },
        { $match: { 'faseData.competencia': competenciaObjectId } },
        {
          $lookup: {
            from: 'equiposcompetencias',
            localField: 'equipoCompetencia',
            foreignField: '_id',
            as: 'equipoCompetenciaData'
          }
        },
        { $unwind: '$equipoCompetenciaData' },
        {
          $lookup: {
            from: 'equipos',
            localField: 'equipoCompetenciaData.equipo',
            foreignField: '_id',
            as: 'equipoCompetenciaData.equipoData'
          }
        },
        { $unwind: '$equipoCompetenciaData.equipoData' },
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
            'equipoCompetenciaData._id': 1,
            'equipoCompetenciaData.equipo': 1,
            'equipoCompetenciaData.equipoData.nombre': 1,
            'faseData._id': 1,
            'faseData.nombre': 1,
            'faseData.tipo': 1,
          }
        }
      ]);

      return res.json(participaciones);
    }

    // Consulta normal sin competenciaId
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
import Fase from '../models/Competencia/Fase.js'; // asegúrate de importar

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

      // Validar fase
      const faseObj = await Fase.findById(fase);
      if (!faseObj) return res.status(400).json({ error: 'Fase no existe' });

      if (faseObj.tipo === 'grupo' && !grupo) {
        return res.status(400).json({ error: 'Debe especificar grupo para fase tipo grupo' });
      }
      if (faseObj.tipo === 'liga' && !division) {
        return res.status(400).json({ error: 'Debe especificar división para fase tipo liga' });
      }

      // Validar duplicados
      const existe = await ParticipacionFase.findOne({ equipoCompetencia, fase });
      if (existe) {
        return res.status(400).json({ error: 'El equipo ya está registrado en esta fase' });
      }

      const nuevaParticipacion = new ParticipacionFase({
        equipoCompetencia,
        fase,
        grupo,
        division,
      });

      await nuevaParticipacion.save();

      const poblada = await ParticipacionFase.findById(nuevaParticipacion._id)
        .populate({
          path: 'equipoCompetencia',
          populate: { path: 'equipo', select: 'nombre' }
        })
        .populate('fase', 'nombre tipo')
        .lean();

      res.status(201).json(poblada);
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
