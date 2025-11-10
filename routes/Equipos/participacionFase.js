// routes/participacionFase.js
import express from 'express';
import ParticipacionFase from '../../models/Equipo/ParticipacionFase.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import mongoose from 'mongoose';
import { sincronizarParticipacionesFaseFaltantes } from '../../utils/sincronizarParticipacionesFaseFaltantes.js';

import Fase from '../../models/Competencia/Fase.js'; // asegúrate de importar
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ParticipacionFase
 *   description: Gestión de la participación de equipos en fases de competencia
 */


// GET /participaciones - listar todas o filtrar por fase, equipoCompetencia, grupo, etc

// ...

/**
 * @swagger
 * /api/participacion-fase:
 *   get:
 *     summary: Lista participaciones de equipos en fases
 *     tags: [ParticipacionFase]
 *     parameters:
 *       - in: query
 *         name: fase
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: equipoCompetencia
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: grupo
 *         schema:
 *           type: string
 *       - in: query
 *         name: division
 *         schema:
 *           type: string
 *       - in: query
 *         name: competenciaId
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de participaciones
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ParticipacionFase'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         description: Error del servidor
 */
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
        path: 'participacionTemporada',
          populate: {
            path: 'equipo',
            select: 'nombre escudo',
          }
        
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

/**
 * @swagger
 * /api/participacion-fase/opciones:
 *   get:
 *     summary: Opciones de ParticipacionTemporada para una fase
 *     description: Devuelve ParticipacionTemporada según el filtro: si se pasa fase devuelve opciones de la temporada asociada a esa fase excluyendo las ya registradas en la fase; si se pasa temporada devuelve todas las ParticipacionTemporada de esa temporada.
 *     tags: [ParticipacionFase]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fase
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: temporada
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Filtro por nombre de equipo
 *     responses:
 *       200:
 *         description: Lista de opciones
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get('/opciones', verificarToken, async (req, res) => {
  try {
    const { fase, temporada, q } = req.query;
    const tieneFase = !!fase;
    const tieneTemporada = !!temporada;
    if ((tieneFase && tieneTemporada) || (!tieneFase && !tieneTemporada)) {
      return res.status(400).json({ message: 'Debe indicar solo fase o temporada' });
    }

    // Caso 1: opciones por temporada (sin exclusión)
    if (tieneTemporada) {
      if (!mongoose.Types.ObjectId.isValid(temporada)) return res.status(400).json({ message: 'temporada inválida' });
      const pts = await ParticipacionTemporada.find({ temporada })
        .populate('equipo', 'nombre escudo tipo pais')
        .populate('temporada', 'nombre')
        .lean();

      let opciones = pts.map(pt => ({
        _id: pt._id,
        equipo: pt.equipo ? { _id: pt.equipo._id, nombre: pt.equipo.nombre, escudo: pt.equipo.escudo, tipo: pt.equipo.tipo, pais: pt.equipo.pais } : null,
        temporada: pt.temporada ? { _id: pt.temporada._id, nombre: pt.temporada.nombre } : null,
      }));

      if (q) {
        const regex = new RegExp(q, 'i');
        opciones = opciones.filter(o => o.equipo?.nombre && regex.test(o.equipo.nombre));
      }

      return res.json(opciones);
    }

    // Caso 2: opciones por fase (excluye las ya registradas)
    if (!mongoose.Types.ObjectId.isValid(fase)) return res.status(400).json({ message: 'fase inválida' });

    const faseDoc = await Fase.findById(fase).select('temporada nombre');
    if (!faseDoc) return res.status(404).json({ message: 'Fase no encontrada' });

    const yaEnFase = await ParticipacionFase.find({ fase }).select('participacionTemporada').lean();
    const ocupadas = new Set(yaEnFase.map(p => p.participacionTemporada?.toString()));

    const pts = await ParticipacionTemporada.find({ temporada: faseDoc.temporada })
      .populate('equipo', 'nombre escudo tipo pais')
      .populate('temporada', 'nombre')
      .lean();

    let opciones = pts
      .filter(pt => pt?._id && !ocupadas.has(pt._id.toString()))
      .map(pt => ({
        _id: pt._id,
        equipo: pt.equipo ? { _id: pt.equipo._id, nombre: pt.equipo.nombre, escudo: pt.equipo.escudo, tipo: pt.equipo.tipo, pais: pt.equipo.pais } : null,
        temporada: pt.temporada ? { _id: pt.temporada._id, nombre: pt.temporada.nombre } : null,
      }));

    if (q) {
      const regex = new RegExp(q, 'i');
      opciones = opciones.filter(o => o.equipo?.nombre && regex.test(o.equipo.nombre));
    }

    return res.json(opciones);
  } catch (error) {
    console.error('Error en GET /participacion-fase/opciones:', error);
    res.status(500).json({ message: 'Error al obtener opciones', error: error.message });
  }
});


// GET /participaciones/:id - obtener participación por id
/**
 * @swagger
 * /api/participacion-fase/{id}:
 *   get:
 *     summary: Obtiene una participación de fase por ID
 *     tags: [ParticipacionFase]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Participación encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ParticipacionFase'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const participacion = await ParticipacionFase.findById(req.params.id)
      .populate({
        path: 'participacionTemporada',
          populate: {
            path: 'equipo',
            select: 'nombre escudo',
          }
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
/**
 * @swagger
 * /api/participacion-fase:
 *   post:
 *     summary: Crea una nueva participación en fase
 *     tags: [ParticipacionFase]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [participacionTemporada, fase]
 *             properties:
 *               participacionTemporada:
 *                 type: string
 *                 format: ObjectId
 *               fase:
 *                 type: string
 *                 format: ObjectId
 *               grupo:
 *                 type: string
 *               division:
 *                 type: string
 *     responses:
 *       201:
 *         description: Creado
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       409:
 *         description: Duplicado
 *       500:
 *         description: Error del servidor
 */
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { participacionTemporada, fase, grupo, division } = req.body;

      if (!participacionTemporada || !fase) {
        return res.status(400).json({ error: 'Se requieren equipoTemporada y fase' });
      }

      // Validar que la fase exista
      const faseObj = await Fase.findById(fase);
      if (!faseObj) return res.status(400).json({ error: 'Fase no existe' });

      // Validar que si es fase grupo o liga se especifique grupo o división
      if (faseObj.tipo === 'grupo' && !grupo) {
        return res.status(400).json({ error: 'Debe especificar grupo para fase tipo grupo' });
      }
      if (faseObj.tipo === 'liga' && !division) {
        return res.status(400).json({ error: 'Debe especificar división para fase tipo liga' });
      }

      // Validar duplicados (mismo equipo-temporada en la misma fase)
      const existe = await ParticipacionFase.findOne({ participacionTemporada, fase });
      if (existe) {
        return res.status(400).json({ error: 'El equipo ya está registrado en esta fase' });
      }

      // Crear nueva participación
      const nuevaParticipacion = new ParticipacionFase({
        participacionTemporada,
        fase,
        grupo,
        division,
      });

      await nuevaParticipacion.save();

      // Poblar para devolver con datos relacionados
      const poblada = await ParticipacionFase.findById(nuevaParticipacion._id)
        .populate({
          path: 'participacionTemporada',
          populate: { path: 'equipo', select: 'nombre' },
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

/**
 * @swagger
 * /api/participacion-fase/sincronizar-fases-faltantes:
 *   post:
 *     summary: Sincroniza participaciones de fase faltantes
 *     tags: [ParticipacionFase]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sincronización completada
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error del servidor
 */
router.post('/sincronizar-fases-faltantes', verificarToken, async (req, res) => {
  try {
    const resultado = await sincronizarParticipacionesFaseFaltantes();
    res.json({ message: 'Sincronización completada', resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al sincronizar fases', error: err.message });
  }
});

// PUT /participaciones/:id - actualizar participación (solo admin o creador)
/**
 * @swagger
 * /api/participacion-fase/{id}:
 *   put:
 *     summary: Actualiza una participación de fase
 *     tags: [ParticipacionFase]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ParticipacionFase'
 *     responses:
 *       200:
 *         description: Actualizado
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
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
/**
 * @swagger
 * /api/participacion-fase/{id}:
 *   delete:
 *     summary: Elimina una participación de fase
 *     tags: [ParticipacionFase]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Eliminado
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
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
