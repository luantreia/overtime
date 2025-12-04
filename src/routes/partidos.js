import express from 'express';
import Partido from '../models/Partido/Partido.js';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../middleware/validacionObjectId.js';
import EquipoPartido from '../models/Equipo/EquipoPartido.js'; // asegurate de importar el modelo
import mongoose from 'mongoose';
import { getPaginationParams } from '../utils/pagination.js';


const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Partidos
  *   description: Gestión de partidos
  */


// GET /api/partidos/admin - partidos que el usuario puede administrar
/**
 * @swagger
 * /api/partidos/admin:
 *   get:
 *     summary: Lista partidos administrables por el usuario
 *     tags: [Partidos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de partidos
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error del servidor
 */
router.get('/admin', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    let partidos;

    if (rol === 'admin') {
      partidos = await Partido.find({}, 'nombrePartido _id fecha estado equipoLocal equipoVisitante competencia fase creadoPor administradores marcadorLocal marcadorVisitante modalidad categoria')
        .populate('equipoLocal', 'nombre escudo')
        .populate('equipoVisitante', 'nombre escudo')
        .populate('competencia', 'nombre')
        .populate('fase', 'nombre')
        .sort({ fecha: -1 })
        .lean();
    } else {
      partidos = await Partido.find({
        $or: [
          { creadoPor: uid },
          { administradores: uid }
        ]
      }, 'nombrePartido _id fecha estado equipoLocal equipoVisitante competencia fase creadoPor administradores marcadorLocal marcadorVisitante modalidad categoria')
        .populate('equipoLocal', 'nombre escudo')
        .populate('equipoVisitante', 'nombre escudo')
        .populate('competencia', 'nombre')
        .populate('fase', 'nombre')
        .sort({ fecha: -1 })
        .lean();
    }

    res.status(200).json(partidos);
  } catch (error) {
    console.error('Error al obtener partidos administrables:', error);
    res.status(500).json({ message: 'Error al obtener partidos administrables' });
  }
});

// GET /api/partidos - Listar partidos, opcionalmente filtrados por fase o competencia
/**
 * @swagger
 * /api/partidos:
 *   get:
 *     summary: Lista partidos
 *     description: Permite filtrar por fase, competencia, tipo=amistoso y equipo.
 *     tags: [Partidos]
 *     parameters:
 *       - in: query
 *         name: fase
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: competencia
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [amistoso]
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de partidos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Partido'
 *       500:
 *         description: Error del servidor
 */
router.get('/', async (req, res) => {
  try {
    const { fase, competencia, competenciaId, tipo, equipo, temporadaId } = req.query;
    const filtro = {};
    const andConditions = [];
    
    const compId = competencia || competenciaId;
    const { page, limit, skip } = getPaginationParams(req);

    if (tipo === 'amistoso') {
      filtro.competencia = null;
    } else {
      if (fase) {
        if (mongoose.Types.ObjectId.isValid(fase)) {
          filtro.fase = fase;
        } else {
          return res.json({ items: [], total: 0, page, limit, pages: 0 });
        }
      } else if (temporadaId) {
        if (mongoose.Types.ObjectId.isValid(temporadaId)) {
          const Fase = (await import('../models/Competencia/Fase.js')).default;
          const fases = await Fase.find({ temporada: temporadaId }).select('_id');
          const faseIds = fases.map(f => f._id);
          andConditions.push({
            $or: [
              { fase: { $in: faseIds } },
              { 'rankedMeta.temporadaId': temporadaId }
            ]
          });
        }
      }

      if (compId) {
        if (mongoose.Types.ObjectId.isValid(compId)) {
          filtro.competencia = compId;
        } else {
          return res.json({ items: [], total: 0, page, limit, pages: 0 });
        }
      }
    }

    if (equipo) {
      if (mongoose.Types.ObjectId.isValid(equipo)) {
        andConditions.push({
          $or: [
            { equipoLocal: equipo },
            { equipoVisitante: equipo }
          ]
        });
      } else {
        return res.json({ items: [], total: 0, page, limit, pages: 0 });
      }
    }

    if (andConditions.length > 0) {
      filtro.$and = andConditions;
    }

    const [total, partidos] = await Promise.all([
      Partido.countDocuments(filtro),
      Partido.find(filtro)
        .populate([
          'competencia',
          'fase',
          'equipoLocal',
          'equipoVisitante',
          'participacionFaseLocal',
          'participacionFaseVisitante',
          'creadoPor',
          'administradores'
        ])
        .sort({ fecha: 1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      items: partidos,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener partidos', error: err.message });
  }
});

// GET /api/partidos/:id - Obtener partido por ID
/**
 * @swagger
 * /api/partidos/{id}:
 *   get:
 *     summary: Obtiene un partido por ID
 *     tags: [Partidos]
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
 *         description: Partido obtenido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Partido'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const partido = await Partido.findById(req.params.id)
      .populate([
        'competencia',
        'fase',
        'equipoLocal',
        'equipoVisitante',
        'participacionFaseLocal',
        'participacionFaseVisitante',
        'creadoPor',
        'administradores'
      ]);

    if (!partido) return res.status(404).json({ message: 'Partido no encontrado' });
    res.json(partido);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener el partido', error: err.message });
  }
});

// POST /api/partidos
/**
 * @swagger
 * /api/partidos:
 *   post:
 *     summary: Crea un nuevo partido
 *     tags: [Partidos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Partido'
 *     responses:
 *       201:
 *         description: Partido creado
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error del servidor
 */
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { participacionFaseLocal, participacionFaseVisitante } = req.body;
    const data = {
      ...req.body,
      creadoPor: req.user.uid,
    };
    const ParticipacionFase = (await import('../models/Equipo/ParticipacionFase.js')).default;
    const Fase = (await import('../models/Competencia/Fase.js')).default;
    const Competencia = (await import('../models/Competencia/Competencia.js')).default;


    // Resolver equipoLocal y equipoVisitante si no vienen
    if (participacionFaseLocal) {
      const pfLocal = await ParticipacionFase.findById(participacionFaseLocal).populate({
        path: 'participacionTemporada',
        populate: 'equipo',
      });
      data.equipoLocal = pfLocal?.participacionTemporada?.equipo?._id;
    }

    if (participacionFaseVisitante) {
      const pfVisitante = await ParticipacionFase.findById(participacionFaseVisitante).populate({
        path: 'participacionTemporada',
        populate: 'equipo',
      });
      data.equipoVisitante = pfVisitante?.participacionTemporada?.equipo?._id;
    }

  // --- Completar competencia desde fase ---
  if (!data.competencia && data.fase) {
    const fase = await Fase.findById(data.fase)
      .populate({
        path: 'temporada',
        populate: { path: 'competencia' }
      });

    if (fase?.temporada?.competencia?._id) {
      data.competencia = fase.temporada.competencia._id;
    }
  }

  // --- Completar modalidad y categoría desde competencia ---
  if (data.competencia && (!data.modalidad || !data.categoria)) {
    const comp = await Competencia.findById(data.competencia);
    if (comp) {
      if (!data.modalidad) data.modalidad = comp.modalidad;
      if (!data.categoria) data.categoria = comp.categoria;
    }
  }

  console.log('Datos para crear partido:', data);
    const nuevoPartido = new Partido(data);
    await nuevoPartido.save();


    // Crear equipo local
    await EquipoPartido.create({
      partido: nuevoPartido._id,
      equipo: nuevoPartido.equipoLocal,
      participacionFase: nuevoPartido.participacionFaseLocal,
      esLocal: true,
      creadoPor: req.user.uid,  
    });

    // Crear equipo visitante
    await EquipoPartido.create({
      partido: nuevoPartido._id,
      equipo: nuevoPartido.equipoVisitante,
      participacionFase: nuevoPartido.participacionFaseVisitante,
      esLocal: false,
      creadoPor: req.user.uid,
    });

    // Después de crear EquipoPartido local y visitante
    if (nuevoPartido.estado === 'finalizado') {
      await nuevoPartido.recalcularMarcador(); // Opcional, si querés calcular por sets
      await nuevoPartido.save(); // Esto dispara el post('save') y asigna resultado a los equipos
    }

    res.status(201).json(nuevoPartido);
  } catch (err) {
    console.error('Error creando partido:', err);
    res.status(400).json({ message: 'Error al crear el partido', error: err.message });
  }
});

// PUT /api/partidos/:id - Actualizar partido
/**
 * @swagger
 * /api/partidos/{id}:
 *   put:
 *     summary: Actualiza un partido
 *     tags: [Partidos]
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
 *             $ref: '#/components/schemas/Partido'
 *     responses:
 *       200:
 *         description: Partido actualizado
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.put(
  '/:id',
  verificarToken,
  cargarRolDesdeBD,
  validarObjectId,
  async (req, res) => {
    try {
      const partido = await Partido.findById(req.params.id);
      if (!partido) {
        return res.status(404).json({ message: 'Partido no encontrado' });
      }

      const uid = req.user.uid;
      const esCreador = partido.creadoPor?.toString() === uid;
      const esAdminDelPartido = partido.administradores?.some(adminId => adminId.toString() === uid);
      const esAdminGlobal = req.user.rol === 'admin';

      if (!esCreador && !esAdminDelPartido && !esAdminGlobal) {
        return res.status(403).json({ message: 'No tiene permiso para editar este partido' });
      }

      const camposEditables = [
        'fecha',
        'ubicacion',
        'estado',
        'fase',
        'etapa',
        'participacionFaseLocal',
        'participacionFaseVisitante',
        'marcadorModificadoManualmente',
        'marcadorLocal',
        'marcadorVisitante',
        'modoEstadisticas',
        'modoVisualizacion',
        'grupo',
        'division',
        'nombrePartido',
        // Nuevos campos permitidos a editar
        'modalidad',
        'categoria',
        'competencia',
        // Timer fields
        'timerMatchValue',
        'timerMatchRunning',
        'timerMatchLastUpdate',
        'period'
      ];

      const objectIdCampos = ['fase', 'participacionFaseLocal', 'participacionFaseVisitante', 'competencia'];

      for (const campo of camposEditables) {
        if (Object.prototype.hasOwnProperty.call(req.body, campo)) {
          if (objectIdCampos.includes(campo)) {
            if (req.body[campo] && !mongoose.Types.ObjectId.isValid(req.body[campo])) {
              return res.status(400).json({ message: `ID inválido para campo ${campo}` });
            }
            partido[campo] = req.body[campo] || null;
          } else {
            partido[campo] = req.body[campo];
          }
        }
      }

      await partido.save();
      res.json(partido);
    } catch (err) {
      console.error('[ERROR][PUT /partidos/:id]', err);
      res.status(500).json({ message: 'Error interno al actualizar el partido', error: err.message });
    }
  }
);

// PUT /api/partidos/:id/recalcular-marcador - Recalcular marcador desde sets
/**
 * @swagger
 * /api/partidos/{id}/recalcular-marcador:
 *   put:
 *     summary: Recalcula el marcador del partido desde sus sets
 *     tags: [Partidos]
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
 *         description: Marcador recalculado
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.put(
  '/:id/recalcular-marcador',
  verificarToken,
  cargarRolDesdeBD,
  validarObjectId,
  async (req, res) => {
    try {
      const partido = await Partido.findById(req.params.id);
      if (!partido) {
        return res.status(404).json({ message: 'Partido no encontrado' });
      }

      const uid = req.user.uid;
      const esCreador = partido.creadoPor?.toString() === uid;
      const esAdminDelPartido = partido.administradores?.some(adminId => adminId.toString() === uid);
      const esAdminGlobal = req.user.rol === 'admin';

      if (!esCreador && !esAdminDelPartido && !esAdminGlobal) {
        return res.status(403).json({ message: 'No tiene permiso para recalcular el marcador de este partido' });
      }

      // Recalcular marcador desde sets
      await partido.recalcularMarcador();
      partido.marcadorModificadoManualmente = false;
      await partido.save();

      res.json(partido);
    } catch (err) {
      console.error('[ERROR][PUT /partidos/:id/recalcular-marcador]', err);
      res.status(500).json({ message: 'Error interno al recalcular marcador', error: err.message });
    }
  }
);

// DELETE /api/partidos/:id - Eliminar partido
/**
 * @swagger
 * /api/partidos/{id}:
 *   delete:
 *     summary: Elimina un partido
 *     tags: [Partidos]
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
 *         description: Partido eliminado correctamente
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const partido = await Partido.findById(req.params.id);
    if (!partido) return res.status(404).json({ message: 'Partido no encontrado' });

    if (
      partido.creadoPor !== req.user.uid &&
      !partido.administradores.includes(req.user.uid) &&
      req.user.rol !== 'admin'
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
