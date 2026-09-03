import express from 'express';
import Partido from '../models/Partido/Partido.js';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../middleware/validacionObjectId.js';
import EquipoPartido from '../models/Equipo/EquipoPartido.js'; // asegurate de importar el modelo
import mongoose from 'mongoose';
import { getPaginationParams } from '../utils/pagination.js';
import { requireCompetenciaPermission } from '../middleware/requireCompetenciaPermission.js';
import { getCompetenciaIdFromFase } from '../services/competenciaPermissionService.js';
import { hasMatchPermission } from '../services/matchPermissionService.js';
import { hasTeamPermission } from '../services/teamPermissionService.js';
import { obtenerJugadoresElegibles } from '../services/jugadoresElegiblesService.js';


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
 *           enum: [amistoso, competencia]
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: estado
 *         description: Acepta un valor único o múltiples (repitiendo el parámetro, ej. ?estado=programado&estado=en_juego)
 *         schema:
 *           oneOf:
 *             - type: string
 *             - type: array
 *               items:
 *                 type: string
 *       - in: query
 *         name: sede
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
    const { fase, competencia, competenciaId, tipo, equipo, temporadaId, estado, jugador, sede } = req.query;
    const filtro = {};
    const andConditions = [];

    if (estado) {
      filtro.estado = Array.isArray(estado) ? { $in: estado } : estado;
    }

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
        const compIds = Array.isArray(compId) ? compId : [compId];
        if (compIds.every((id) => mongoose.Types.ObjectId.isValid(id))) {
          filtro.competencia = compIds.length > 1 ? { $in: compIds } : compIds[0];
        } else {
          return res.json({ items: [], total: 0, page, limit, pages: 0 });
        }
      } else if (tipo === 'competencia') {
        filtro.competencia = { $ne: null };
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

    if (jugador) {
      if (mongoose.Types.ObjectId.isValid(jugador)) {
        const JugadorPartido = (await import('../models/Jugador/JugadorPartido.js')).default;
        const jps = await JugadorPartido.find({ jugador }).select('partido').lean();
        const partidoIds = jps.map(jp => jp.partido);
        andConditions.push({ _id: { $in: partidoIds } });
      } else {
        return res.json({ items: [], total: 0, page, limit, pages: 0 });
      }
    }

    if (sede) {
      if (mongoose.Types.ObjectId.isValid(sede)) {
        filtro.sede = sede;
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
          'temporada',
          'fase',
          'equipoLocal',
          'equipoVisitante',
          'participacionFaseLocal',
          'participacionFaseVisitante',
          'matchTeams',
          // Sólo el nombre. Esta ruta es publica (no lleva verificarToken) y popular el Usuario
          // entero devolvia el email de cada DT y admin que creo o administra un partido: con un
          // solo GET se enumeraban los mails de todos los entrenadores de la plataforma. El
          // passwordHash ya estaba a salvo por el select:false del modelo, el email no.
          { path: 'creadoPor', select: 'nombre' },
          { path: 'administradores', select: 'nombre' }
        ])
        .populate('sets', '_id numeroSet estadoSet ganadorSet duracionReal')
        // Descendente: con más de `limit` partidos totales (tope 1000, ver getPaginationParams),
        // una consulta sin filtro angosto se corta — mejor perder los más viejos que los recientes.
        .sort({ fecha: -1 })
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
        'temporada',
        'fase',
        'equipoLocal',
        'equipoVisitante',
        'participacionFaseLocal',
        'participacionFaseVisitante',
        'sede',
        // Idem GET /api/partidos: esta ruta tampoco exige token, asi que nada de emails.
        { path: 'creadoPor', select: 'nombre' },
        { path: 'administradores', select: 'nombre' }
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
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  // Antes esta ruta no validaba nada: cualquier usuario logueado podía crear partidos dentro de
  // la fase/competencia de otro. Los amistosos sueltos (sin fase ni competencia) siguen abiertos
  // a propósito — los crean DTs y jugadores con `crearAmistoso` desde dodgeballmanager y Manager.
  requireCompetenciaPermission({
    permission: 'events.manage',
    allowWhenUnresolved: true,
    resolveCompetenciaId: async (req) => {
      if (req.body?.competencia) return String(req.body.competencia);
      if (req.body?.fase) return getCompetenciaIdFromFase(req.body.fase);
      return null; // amistoso: no cuelga de ninguna competencia
    },
  }),
  async (req, res) => {
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

  // --- Completar competencia y temporada desde fase ---
  if ((!data.competencia || !data.temporada) && data.fase) {
    const fase = await Fase.findById(data.fase)
      .populate({
        path: 'temporada',
        populate: { path: 'competencia' }
      });

    if (fase?.temporada?.competencia?._id && !data.competencia) {
      data.competencia = fase.temporada.competencia._id;
    }
    if (fase?.temporada?._id && !data.temporada) {
      data.temporada = fase.temporada._id;
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
  }
);

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

      // hasMatchPermission ya contempla admin global, creador y administradores del partido —
      // o sea todo lo que validaba el chequeo inline anterior — y además habilita a quien
      // gestiona la competencia y a los planilleros/árbitros con asignación vigente.
      const puede = await hasMatchPermission({
        partidoId: req.params.id,
        usuarioId: req.user.uid,
        rolGlobal: req.user.rol,
        permission: 'match.resultado',
      });

      if (!puede) {
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

      const puede = await hasMatchPermission({
        partidoId: req.params.id,
        usuarioId: req.user.uid,
        rolGlobal: req.user.rol,
        permission: 'match.resultado',
      });

      if (!puede) {
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

    // Si es un partido ranked que fue aplicado, revertir los stats primero
    if (partido.isRanked && partido.rankedMeta?.applied) {
      try {
        const { revertRankedResult } = await import('../services/ratingService.js');
        await revertRankedResult(partido._id.toString());
      } catch (revertErr) {
        // Log pero continuar con el borrado de todos modos
        console.warn('Error revirtiendo stats al borrar partido ranked:', revertErr.message);
      }
    }

    await partido.deleteOne();

    // Limpieza de colecciones relacionadas
    try {
      const MatchPlayer = mongoose.model('MatchPlayer');
      const MatchTeam = mongoose.model('MatchTeam');
      const EquipoPartido = mongoose.model('EquipoPartido');
      const SetPartido = mongoose.model('SetPartido');
      const Lobby = mongoose.model('Lobby');

      await Promise.all([
        MatchPlayer.deleteMany({ partidoId: req.params.id }),
        MatchTeam.deleteMany({ partidoId: req.params.id }),
        EquipoPartido.deleteMany({ partido: req.params.id }),
        SetPartido.deleteMany({ partido: req.params.id }),
        // Si venía de un Lobby de La Plaza, marcarlo como cancelado/revertido
        Lobby.updateOne({ matchId: req.params.id }, { $set: { status: 'cancelled' }, $unset: { matchId: 1 } })
      ]);
    } catch (cleanErr) {
      console.warn('Error en limpieza de tablas relacionadas:', cleanErr.message);
    }

    res.json({ message: 'Partido eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar el partido', error: err.message });
  }
});

/**
 * @swagger
 * /api/partidos/{id}/jugadores-elegibles:
 *   get:
 *     summary: Jugadores que pueden aparecer en la captura de este partido
 *     tags: [Partidos]
 *     description: >
 *       Resuelve la lista por cascada — convocatoria del partido, si no lista de buena
 *       fe de la temporada, si no plantel vigente A LA FECHA DEL PARTIDO — y le aplica
 *       la categoría de la competencia. Existe para que la captura deje de ofrecer
 *       jugadores con contratos de años anteriores. El campo `origen` dice de dónde
 *       salió la lista, y `excluidos` cuántos quedaron afuera y por qué.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: ObjectId }
 *       - in: query
 *         name: equipo
 *         required: true
 *         schema: { type: string, format: ObjectId }
 *     responses:
 *       200: { description: Lista de elegibles con su origen }
 *       400: { description: Falta el equipo o es inválido }
 *       403: { description: El equipo no juega este partido }
 *       404: { description: Partido no encontrado }
 */
router.get('/:id/jugadores-elegibles', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { equipo } = req.query;
    if (!equipo || !mongoose.Types.ObjectId.isValid(equipo)) {
      return res.status(400).json({ message: 'Se requiere un equipo válido' });
    }

    const resultado = await obtenerJugadoresElegibles({ partidoId: req.params.id, equipoId: equipo });

    if (!resultado) return res.status(404).json({ message: 'Partido no encontrado' });
    if (resultado.noParticipa) {
      return res.status(403).json({ message: 'El equipo no participa de este partido' });
    }

    return res.status(200).json(resultado);
  } catch (error) {
    console.error('Error resolviendo jugadores elegibles:', error);
    return res.status(500).json({ message: 'Error al resolver los jugadores elegibles' });
  }
});

/**
 * @swagger
 * /api/partidos/{id}/mis-permisos:
 *   get:
 *     summary: Qué puede hacer el usuario autenticado sobre este partido
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
 *         description: Permisos del usuario sobre el partido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 partidoId: { type: string }
 *                 esCompetencia: { type: boolean }
 *                 canManageLineup: { type: boolean }
 *                 canManageSets: { type: boolean }
 *                 canSetResultado: { type: boolean }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
// Espejo de /equipos/:id/mis-permisos, pero para la capa de partido. La UI lo
// necesita para no ofrecer acciones que el backend va a rechazar: en un partido
// de competencia, cargar alineación o sets es del organizador o de quien tenga
// una asignación vigente, no de los equipos que juegan.
router.get('/:id/mis-permisos', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const partidoId = req.params.id;
    const usuarioId = req.user.uid;
    const rolGlobal = req.user.rol;

    const partido = await Partido.findById(partidoId)
      .select('competencia equipoLocal equipoVisitante')
      .lean();
    if (!partido) {
      return res.status(404).json({ message: 'Partido no encontrado' });
    }

    // `stats.capture` se valida por equipo, no por partido: un DT puede cargar las estadísticas
    // de su plantel y no las del rival. El panel mostraba las dos grillas por igual, así que se
    // cargaban los números del rival, se guardaban los propios y los ajenos morían en un 403
    // con un error genérico. Devolvemos el permiso por lado para que la UI sólo ofrezca lo que
    // el usuario puede escribir de verdad.
    const puedeCapturarEquipo = (equipoId) =>
      equipoId
        ? hasTeamPermission({ equipoId: String(equipoId), usuarioId, rolGlobal, permission: 'stats.capture' })
        : Promise.resolve(false);

    const [canManageLineup, canManageSets, canSetResultado, canCaptureLocal, canCaptureVisitante] =
      await Promise.all([
        hasMatchPermission({ partidoId, usuarioId, rolGlobal, permission: 'match.lineup' }),
        hasMatchPermission({ partidoId, usuarioId, rolGlobal, permission: 'match.sets' }),
        hasMatchPermission({ partidoId, usuarioId, rolGlobal, permission: 'match.resultado' }),
        puedeCapturarEquipo(partido.equipoLocal),
        puedeCapturarEquipo(partido.equipoVisitante),
      ]);

    return res.status(200).json({
      partidoId,
      esCompetencia: Boolean(partido.competencia),
      canManageLineup,
      canManageSets,
      canSetResultado,
      canCaptureStatsLocal: canCaptureLocal,
      canCaptureStatsVisitante: canCaptureVisitante,
    });
  } catch (error) {
    console.error('Error al obtener mis permisos de partido:', error);
    return res.status(500).json({ message: 'Error al obtener permisos del partido' });
  }
});

export default router;
