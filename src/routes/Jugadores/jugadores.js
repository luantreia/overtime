import express from 'express';
import Jugador from '../../models/Jugador/Jugador.js';
import JugadorEquipo from '../../models/Jugador/JugadorEquipo.js';
import JugadorCompetencia from '../../models/Jugador/JugadorCompetencia.js';
import PlayerRating from '../../models/Jugador/PlayerRating.js';
import EquipoCompetencia from '../../models/Equipo/EquipoCompetencia.js';
import MatchPlayer from '../../models/Partido/MatchPlayer.js';
import JugadorTemporada from '../../models/Jugador/JugadorTemporada.js';
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';
import KarmaLog from '../../models/Plaza/KarmaLog.js';
import Lobby from '../../models/Plaza/Lobby.js';
import mongoose from 'mongoose';
import { esAdminDeEntidad } from '../../middleware/esAdminDeEntidad.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { verificarEntidad } from '../../middleware/verificarEntidad.js';
import Usuario from '../../models/Usuario.js';
import { getPaginationParams } from '../../utils/pagination.js';

/**
 * @swagger
 * tags:
 *   name: Jugadores
 *   description: Gestión de jugadores del sistema
 */

const { Types } = mongoose;
const router = express.Router();


router.get('/me/profile', verificarToken, async (req, res) => {
  try {
    const jugador = await Jugador.findOne({ userId: req.user.uid });
    if (!jugador) return res.status(404).json({ message: 'No tienes un perfil vinculado' });
    res.json(jugador);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener perfil', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugadores:
 *   post:
 *     summary: Crea un nuevo jugador
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - fechaNacimiento
 *             properties:
 *               nombre:
 *                 type: string
 *                 description: Nombre completo del jugador
 *               alias:
 *                 type: string
 *                 description: Apodo del jugador (opcional)
 *               fechaNacimiento:
 *                 type: string
 *                 format: date
 *                 description: Fecha de nacimiento en formato YYYY-MM-DD
 *               genero:
 *                 type: string
 *                 enum: [masculino, femenino, otro]
 *                 description: Género del jugador
 *               foto:
 *                 type: string
 *                 description: URL de la foto del jugador
 *     responses:
 *       201:
 *         description: Jugador creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *       500:
 *         description: Error del servidor
 */
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre, alias, fechaNacimiento, genero, foto } = req.body;
    if (!nombre) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    // Si no es admin, verificar que no tenga ya un perfil vinculado
    if (req.user.rol !== 'admin') {
      const yaTiene = await Jugador.findOne({ userId: req.user.uid });
      if (yaTiene) {
        return res.status(400).json({ message: 'Ya tienes un perfil vinculado: ' + yaTiene.nombre });
      }
    }

    const jugador = new Jugador({
      nombre,
      alias,
      fechaNacimiento: fechaNacimiento || undefined,
      genero,
      foto,
      userId: req.body.userId || (req.user.rol !== 'admin' ? req.user.uid : null),
      perfilReclamado: !!(req.body.userId || req.user.rol !== 'admin'),
      creadoPor: req.user.uid,
      administradores: [req.user.uid]
    });

    await jugador.save();
    res.status(201).json(jugador);
  } catch (error) {
    console.error('Error al guardar jugador:', error);
    res.status(400).json({ message: 'Error al guardar jugador', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/claim:
 *   post:
 *     summary: Solicita reclamar el perfil de un jugador
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del jugador a reclamar
 *     responses:
 *       201:
 *         description: Solicitud de reclamo creada
 *       400:
 *         description: El perfil ya ha sido reclamado o el usuario ya es admin
 *       404:
 *         description: Jugador no encontrado
 */
router.post('/:id/claim', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;

    const jugador = await Jugador.findById(id);
    if (!jugador) {
      return res.status(404).json({ message: 'Jugador no encontrado' });
    }

    if (jugador.perfilReclamado) {
      return res.status(400).json({ message: 'Este perfil ya ha sido reclamado por otro usuario' });
    }

    if (jugador.userId && jugador.userId.toString() === uid) {
      return res.status(400).json({ message: 'Ya eres el dueño de este perfil' });
    }

    // NUEVO: Validar que el usuario no tenga ya otro perfil reclamado
    const yaTienePerfil = await Jugador.findOne({ userId: uid });
    if (yaTienePerfil) {
      return res.status(400).json({ 
        message: 'No puedes reclamar más de un perfil. Ya tienes vinculado el perfil de ' + yaTienePerfil.nombre 
      });
    }

    const SolicitudEdicion = mongoose.model('SolicitudEdicion');

    const existente = await SolicitudEdicion.findOne({
      tipo: 'jugador-claim',
      creadoPor: uid,
      estado: 'pendiente'
    });

    if (existente) {
      return res.status(400).json({ message: 'Ya tienes una solicitud de reclamo pendiente. Solo puedes tener un perfil activo.' });
    }

    const solicitud = new SolicitudEdicion({
      tipo: 'jugador-claim',
      entidad: id,
      creadoPor: uid,
      datosPropuestos: {
        jugadorId: id,
        userId: uid
      }
    });

    await solicitud.save();

    res.status(201).json({
      message: 'Solicitud de reclamo enviada correctamente',
      solicitudId: solicitud._id
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al procesar la solicitud de reclamo', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/release-identity:
 *   post:
 *     summary: (Admin) Libera la identidad de un jugador
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Identidad liberada exitosamente
 */
router.post('/:id/release-identity', verificarToken, validarObjectId, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No tienes permisos para realizar esta acción' });
    }

    const { id } = req.params;
    const jugador = await Jugador.findById(id);
    if (!jugador) return res.status(404).json({ message: 'Jugador no encontrado' });

    jugador.userId = null;
    jugador.perfilReclamado = false;
    await jugador.save();

    res.json({ message: 'Identidad liberada. El perfil vuelve a ser fantasma.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al liberar identidad', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/unclaim-admin:
 *   post:
 *     summary: (Admin) Fuerza la desvinculación de un perfil de un usuario
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/unclaim-admin', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'Solo los administradores del sistema pueden forzar la desvinculación' });
    }

    const jugador = await Jugador.findById(req.params.id);
    if (!jugador) return res.status(404).json({ message: 'Jugador no encontrado' });

    jugador.userId = null;
    jugador.perfilReclamado = false;
    await jugador.save();

    res.json({ message: 'Perfil desvinculado correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al desvincular perfil', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/transfer-identity:
 *   post:
 *     summary: (Dueño) Transfiere la identidad a otro usuario o la libera
 *     description: Permite al dueño actual renunciar a su identidad o pasarla a otro ID de usuario.
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nuevoUserId:
 *                 type: string
 *                 description: ID del nuevo dueño (opcional, si no se envía, el perfil queda libre)
 *     responses:
 *       200:
 *         description: Transferencia exitosa
 */
router.post('/:id/transfer-identity', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const { nuevoUserId, quitarmeComoAdmin } = req.body;
    const uid = req.user.uid;

    const jugador = await Jugador.findById(id);
    if (!jugador) return res.status(404).json({ message: 'Jugador no encontrado' });

    // Solo el dueño puede transferir su propia identidad
    if (!jugador.userId || jugador.userId.toString() !== uid) {
      return res.status(403).json({ message: 'Solo el dueño del perfil puede transferir su identidad' });
    }

    if (nuevoUserId) {
      jugador.userId = nuevoUserId;
      jugador.perfilReclamado = true;
      
      // Asegurar que el nuevo dueño sea admin
      if (!jugador.administradores.some(aid => aid.toString() === nuevoUserId.toString())) {
        jugador.administradores.push(nuevoUserId);
      }
    } else {
      // Si no hay nuevoUserId, es un self-release (renuncia)
      jugador.userId = null;
      jugador.perfilReclamado = false;
    }

    // Eva decide si quiere dejar de ser administradora
    if (quitarmeComoAdmin) {
      // Solo permitimos quitarse si hay otros admins (como Fran) 
      // para evitar dejar el perfil sin ningún responsable.
      if (jugador.administradores.length > 1) {
        jugador.administradores = jugador.administradores.filter(aid => aid.toString() !== uid);
      } else if (!nuevoUserId) {
        return res.status(400).json({ 
          message: 'No puedes quitarte como único administrador sin transferir la identidad a alguien más.' 
        });
      }
    }

    await jugador.save();
    res.json({ 
      message: nuevoUserId ? 'Identidad transferida exitosamente' : 'Has renunciado a la identidad de este perfil',
      removidoComoAdmin: quitarmeComoAdmin && !jugador.administradores.some(aid => aid.toString() === uid)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error en la transferencia de identidad', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugadores/admin:
 *   get:
 *     summary: Obtiene jugadores administrables por el usuario autenticado
 *     description: |
 *       Retorna una lista de jugadores que el usuario actual puede administrar.
 *       - Los administradores globales ven todos los jugadores.
 *       - Los usuarios normales solo ven los jugadores que ellos crearon o de los que son administradores.
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página para la paginación (comienza en 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Cantidad de resultados por página (máx 100)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [nombre, fechaNacimiento, createdAt]
 *           default: nombre
 *         description: Campo por el cual ordenar los resultados
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Orden de clasificación (ascendente o descendente)
 *     responses:
 *       200:
 *         description: Lista de jugadores administrables obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Jugador'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *                 total:
 *                   type: integer
 *                   description: Número total de jugadores que coinciden con los filtros
 *       400:
 *         description: Parámetros de consulta inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Prohibido - No tienes permisos para acceder a este recurso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/admin', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    let jugadores;

    if (rol === 'admin') {
      jugadores = await Jugador.find({}, 'nombre _id fechaNacimiento genero nacionalidad createdAt updatedAt').lean();
    } else {
      jugadores = await Jugador.find({
        $or: [
          { creadoPor: uid },
          { administradores: uid }
        ]
      }, 'nombre _id fechaNacimiento genero nacionalidad createdAt updatedAt').lean();
    }

    res.status(200).json(jugadores);
  } catch (error) {
    console.error('Error al obtener jugadores administrables:', error);
    res.status(500).json({ message: 'Error al obtener jugadores administrables' });
  }
});


/**
 * @swagger
 * /api/jugadores:
 *   get:
 *     summary: Obtiene todos los jugadores
 *     description: Retorna una lista de todos los jugadores registrados en el sistema
 *     tags: [Jugadores]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Cantidad máxima de resultados a devolver
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página para la paginación
 *     responses:
 *       200:
 *         description: Lista de jugadores obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Jugador'
 *       500:
 *         description: Error del servidor al obtener los jugadores
 */
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const { page, limit, skip } = getPaginationParams(req);
    const query = {};

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { nombre: regex },
        { alias: regex },
        { dni: regex }
      ];
    }

    const [total, jugadores] = await Promise.all([
      Jugador.countDocuments(query),
      Jugador.find(query)
        .populate('userId', 'nombre email')
        .limit(limit)
        .skip(skip)
        .sort({ nombre: 1 })
        .lean()
    ]);

    res.status(200).json({
      items: jugadores,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


/**
 * @swagger
 * /api/jugadores/{id}:
 *   get:
 *     summary: Obtiene un jugador por su ID
 *     description: |
 *       Retorna los detalles completos de un jugador específico, incluyendo información de sus administradores.
 *       
 *       ### Detalles adicionales:
 *       - Incluye información básica del jugador (nombre, alias, fecha de nacimiento, etc.)
 *       - Incluye lista de administradores con sus datos básicos (email, nombre)
 *       - Los campos sensibles como contraseñas nunca son incluidos
 *     tags: [Jugadores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *           example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *         description: ID único del jugador a consultar
 *     responses:
 *       200:
 *         description: Jugador encontrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Jugador'
 *             example:
 *               _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *               nombre: "Juan Pérez"
 *               alias: "JP"
 *               fechaNacimiento: "1990-01-01T00:00:00.000Z"
 *               genero: "masculino"
 *               foto: "https://ejemplo.com/fotos/juan-perez.jpg"
 *               nacionalidad: "Argentina"
 *               administradores:
 *                 - _id: 507f1f77bcf86cd799439011
 *                   email: "admin@ejemplo.com"
 *                   nombre: "Admin Principal"
 *               createdAt: "2023-01-15T10:30:00.000Z"
 *               updatedAt: "2023-01-15T10:30:00.000Z"
 *       400:
 *         description: ID de jugador inválido o con formato incorrecto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "ID de jugador inválido"
 *               error: "Cast to ObjectId failed for value \"invalid-id\" at path \"_id\" for model \"Jugador\""
 *       404:
 *         description: No se encontró ningún jugador con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Jugador no encontrado"
 *       500:
 *         description: Error interno del servidor al procesar la solicitud
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const jugador = await Jugador.findById(req.params.id)
      .populate('administradores', 'email nombre') // opcional: trae info de admins
      .lean();

    if (!jugador) {
      return res.status(404).json({ message: 'Jugador no encontrado' });
    }

    // También podés poblar otras relaciones si lo necesitás
    res.status(200).json(jugador);
  } catch (error) {
    console.error('Error al obtener jugador:', error);
    res.status(500).json({ message: 'Error al obtener jugador' });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/competencias:
 *   get:
 *     summary: Obtiene todas las competencias en las que participa un jugador
 *     tags: [Jugadores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de competencias
 */
router.get('/:id/competencias', validarObjectId, async (req, res) => {
  try {
    const jugadorId = req.params.id;
    console.log(`[Competencias] Buscando para jugador: ${jugadorId}`);
    
    // 1. Registro directo (JugadorCompetencia)
    const directRel = await JugadorCompetencia.find({ jugador: jugadorId })
      .populate({
        path: 'competencia',
        populate: { path: 'organizacion', select: 'nombre' }
      })
      .lean();
    console.log(`[Competencias] Directas: ${directRel.length}`);
    
    // 2. Ranked (PlayerRating)
    const ratings = await PlayerRating.find({ playerId: jugadorId, competenciaId: { $ne: null } })
      .populate({
        path: 'competenciaId',
        populate: { path: 'organizacion', select: 'nombre' }
      })
      .lean();
    console.log(`[Competencias] Ranked: ${ratings.length}`);
      
    // 3. Por Equipo (JugadorEquipo -> EquipoCompetencia)
    const teams = await JugadorEquipo.find({ jugador: jugadorId, estado: 'aceptado' }).lean();
    const teamIds = teams.map(t => t.equipo).filter(Boolean);
    console.log(`[Competencias] Equipos encontrados: ${teamIds.length}`);
    
    let teamComps = [];
    if (teamIds.length > 0) {
      teamComps = await EquipoCompetencia.find({ equipo: { $in: teamIds }, estado: 'aceptado' })
        .populate({
          path: 'competencia',
          populate: { path: 'organizacion', select: 'nombre' }
        })
        .lean();
    }
    console.log(`[Competencias] Competencias por equipo: ${teamComps.length}`);
    
    // 4. Determinar la temporada más "atractiva" (donde más jugó o la más reciente)
    const matchStats = await MatchPlayer.aggregate([
      { $match: { playerId: new mongoose.Types.ObjectId(jugadorId) } },
      { $group: { 
          _id: { comp: '$competenciaId', temp: '$temporadaId' }, 
          count: { $sum: 1 } 
      }},
      { $sort: { count: -1 } }
    ]);

    const compBestSeason = new Map();
    const compTotalMatches = new Map();

    matchStats.forEach(stat => {
      const cid = stat._id.comp?.toString();
      const tid = stat._id.temp?.toString();
      if (cid) {
        if (!compBestSeason.has(cid)) compBestSeason.set(cid, tid);
        compTotalMatches.set(cid, (compTotalMatches.get(cid) || 0) + stat.count);
      }
    });

    // Buscar registros en temporadas por si no hay partidos
    const registrations = await JugadorTemporada.find({ jugador: jugadorId })
      .populate({
        path: 'participacionTemporada',
        select: 'temporada',
        populate: { path: 'temporada', select: 'competencia' }
      })
      .lean();
    
    registrations.forEach(reg => {
      const temp = reg.participacionTemporada?.temporada;
      if (temp) {
        const cid = temp.competencia?.toString();
        const tid = temp._id?.toString();
        if (cid && !compBestSeason.has(cid)) {
          compBestSeason.set(cid, tid);
        }
      }
    });

    // 5. Fallback: Temporada con más equipos de toda la competencia
    const uniqueCompIds = Array.from(new Set([
      ...directRel.map(r => r.competencia?._id?.toString()),
      ...ratings.map(r => r.competenciaId?._id?.toString()),
      ...teamComps.map(r => r.competencia?._id?.toString())
    ])).filter(Boolean);

    if (uniqueCompIds.length > 0) {
      const objectCompIds = uniqueCompIds.map(id => new mongoose.Types.ObjectId(id));
      
      const seasonsStats = await ParticipacionTemporada.aggregate([
        { $lookup: {
            from: 'temporadas',
            localField: 'temporada',
            foreignField: '_id',
            as: 'tempDoc'
        }},
        { $unwind: '$tempDoc' },
        { $match: { 'tempDoc.competencia': { $in: objectCompIds } } },
        { $group: {
            _id: { comp: '$tempDoc.competencia', temp: '$temporada' },
            teamCount: { $sum: 1 }
        }},
        { $sort: { teamCount: -1 } }
      ]);

      seasonsStats.forEach(stat => {
        const cid = stat._id.comp?.toString();
        const tid = stat._id.temp?.toString();
        if (cid && !compBestSeason.has(cid)) {
          compBestSeason.set(cid, tid);
        }
      });
    }

    // Unificar y quitar duplicados por ID de competencia
    const compMap = new Map();
    
    directRel.forEach(r => {
      if (r.competencia?._id || r.competencia?.id) {
        const c = r.competencia;
        const id = (c._id || c.id).toString();
        compMap.set(id, { 
          ...c, 
          id, 
          matchCount: compTotalMatches.get(id) || 0,
          preferredSeasonId: compBestSeason.get(id)
        });
      }
    });
    
    ratings.forEach(r => {
      if (r.competenciaId?._id || r.competenciaId?.id) {
        const c = r.competenciaId;
        const id = (c._id || c.id).toString();
        compMap.set(id, { 
          ...c, 
          id, 
          matchCount: compTotalMatches.get(id) || 0,
          preferredSeasonId: compBestSeason.get(id)
        });
      }
    });
    
    teamComps.forEach(r => {
      if (r.competencia?._id || r.competencia?.id) {
        const c = r.competencia;
        const id = (c._id || c.id).toString();
        compMap.set(id, { 
          ...c, 
          id, 
          matchCount: compTotalMatches.get(id) || 0,
          preferredSeasonId: compBestSeason.get(id)
        });
      }
    });
    
    const finalResult = Array.from(compMap.values());
    console.log(`[Competencias] Total unificadas: ${finalResult.length}`);
    res.json(finalResult);
  } catch (error) {
    console.error('Error al obtener competencias del jugador:', error);
    res.status(500).json({ message: 'Error al obtener competencias del jugador' });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}:
 *   put:
 *     summary: Actualiza un jugador existente
 *     description: Actualiza los datos de un jugador. Requiere permisos de administración sobre el jugador.
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del jugador a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *                 description: Nombre completo del jugador
 *               alias:
 *                 type: string
 *                 description: Apodo del jugador
 *               fechaNacimiento:
 *                 type: string
 *                 format: date
 *                 description: Fecha de nacimiento (YYYY-MM-DD)
 *               genero:
 *                 type: string
 *                 enum: [masculino, femenino, otro]
 *                 description: Género del jugador
 *               foto:
 *                 type: string
 *                 description: URL de la foto del jugador
 *               nacionalidad:
 *                 type: string
 *                 description: Nacionalidad del jugador
 *               administradores:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de IDs de usuarios administradores
 *     responses:
 *       200:
 *         description: Jugador actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Jugador'
 *       400:
 *         description: Datos de entrada inválidos
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *       403:
 *         description: Prohibido - No tienes permisos para actualizar este jugador
 *       404:
 *         description: Jugador no encontrado
 *       500:
 *         description: Error del servidor al actualizar el jugador
 */
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, esAdminDeEntidad(Jugador, 'jugador'), async (req, res) => {
  try {
    const jugador = req.jugador; // ya validado por middleware
    const {
      nombre,
      alias,
      fechaNacimiento,
      genero,
      foto,
      nacionalidad,
      administradores // opcional, si quieres permitir actualizar admins
    } = req.body;

    if (nombre !== undefined) jugador.nombre = nombre;
    if (alias !== undefined) jugador.alias = alias;
    if (fechaNacimiento !== undefined) jugador.fechaNacimiento = fechaNacimiento;
    if (genero !== undefined) jugador.genero = genero;
    if (foto !== undefined) jugador.foto = foto;
    if (nacionalidad !== undefined) jugador.nacionalidad = nacionalidad;
    if (administradores !== undefined && Array.isArray(administradores)) jugador.administradores = administradores;

    await jugador.save();
    res.status(200).json(jugador);
  } catch (error) {
    console.error('Error al actualizar jugador:', error);
    res.status(500).json({ message: 'Error al actualizar jugador', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/administradores:
 *   get:
 *     summary: Obtiene los administradores de un jugador
 *     description: |
 *       Retorna la lista de usuarios que tienen permisos de administración sobre un jugador específico.
 *       
 *       ### Detalles:
 *       - Solo los administradores del jugador o los administradores globales pueden ver esta información
 *       - Si hay un error al cargar la información detallada, se devuelven solo los IDs
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *           example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *         description: ID único del jugador
 *     responses:
 *       200:
 *         description: Lista de administradores obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 oneOf:
 *                   - $ref: '#/components/schemas/Usuario'
 *                   - type: string
 *                     description: ID del usuario (en caso de error al cargar detalles)
 *               example:
 *                 - _id: "507f1f77bcf86cd799439011"
 *                   email: "admin@example.com"
 *                   nombre: "Administrador Principal"
 *       400:
 *         description: ID de jugador inválido o formato incorrecto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Prohibido - No tienes permisos para ver los administradores de este jugador
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No se encontró el jugador con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor al procesar la solicitud
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id/administradores', verificarEntidad(Jugador, 'id', 'jugador'), async (req, res) => {
  try {
    let admins = req.jugador.administradores || [];
    try {
      await req.jugador.populate('administradores', 'email nombre');
      admins = req.jugador.administradores;
    } catch (popError) {
      console.error('Populate error, returning IDs:', popError.message);
      // Keep admins as IDs
    }
    res.status(200).json(admins);
  } catch (error) {
    console.error('Error al obtener administradores:', error);
    res.status(500).json({ message: 'Error al obtener administradores' });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/administradores:
 *   post:
 *     summary: Agrega un administrador a un jugador
 *     description: |
 *       Agrega un usuario como administrador de un jugador específico.
 *       Se puede especificar el usuario por su ID (adminUid) o por su email.
 *       Requiere permisos de administración sobre el jugador.
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del jugador al que se le agregará el administrador
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             oneOf:
 *               - required: [adminUid]
 *                 properties:
 *                   adminUid:
 *                     type: string
 *                     description: ID del usuario a agregar como administrador
 *               - required: [email]
 *                 properties:
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: Email del usuario a agregar como administrador
 *     responses:
 *       200:
 *         description: Administrador agregado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Jugador'
 *       400:
 *         description: Solicitud inválida (faltan parámetros o el usuario ya es administrador)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *       403:
 *         description: Prohibido - No tienes permisos para realizar esta acción
 *       404:
 *         description: Jugador o usuario no encontrado
 *       500:
 *         description: Error del servidor al agregar el administrador
 */
router.post('/:id/administradores', verificarToken, cargarRolDesdeBD, verificarEntidad(Jugador, 'id', 'jugador'), async (req, res) => {
  try {
    const uid = req.user.uid;
    const jugador = req.jugador;
    const { adminUid, email } = req.body;

    if (!adminUid && !email) {
      return res.status(400).json({ message: 'Se requiere adminUid o email' });
    }

    let usuarioAdminId = adminUid;

    // Si mandan un email, buscamos el UID correspondiente
    if (email && !adminUid) {
      const usuario = await Usuario.findOne({ email });
      if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
      usuarioAdminId = usuario._id.toString();
    }

    const esAdmin =
      jugador.creadoPor?.toString() === uid ||
      (jugador.administradores || []).some((a) => a.toString() === uid);

    if (!esAdmin && req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No autorizado para modificar administradores' });
    }

    if (!jugador.administradores.includes(usuarioAdminId)) {
      jugador.administradores.push(usuarioAdminId);
      await jugador.save();
    }

    await jugador.populate('administradores', 'email nombre');
    res.status(200).json({ administradores: jugador.administradores });
  } catch (error) {
    console.error('Error al agregar administrador:', error);
    res.status(500).json({ message: 'Error al agregar administrador' });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/administradores/{adminId}:
 *   delete:
 *     summary: Quita un administrador de un jugador
 *     description: Elimina los permisos de administración de un usuario sobre un jugador específico.
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del jugador
 *       - in: path
 *         name: adminId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del administrador a quitar
 *     responses:
 *       200:
 *         description: Administrador quitado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 administradores:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       email:
 *                         type: string
 *                       nombre:
 *                         type: string
 *       400:
 *         description: "Solicitud inválida (ej: intentando quitar al único administrador)"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No se puede quitar al único administrador"
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *       403:
 *         description: Prohibido - No tienes permisos para modificar este jugador
 *       404:
 *         description: No se encontró el jugador o el administrador
 *       500:
 *         description: Error del servidor al procesar la solicitud
 */
router.delete('/:id/administradores/:adminId', verificarToken, esAdminDeEntidad(Jugador, 'jugador'), async (req, res) => {
  try {
    const { id, adminId } = req.params;
    
    // Verificar que el jugador existe (ya está verificado por esAdminDeEntidad)
    const jugador = req.jugador;

    // Verificar que el administrador existe
    const admin = await Usuario.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'El administrador no existe' });
    }

    // Verificar que el administrador está en la lista
    if (!jugador.administradores.includes(adminId)) {
      return res.status(400).json({ message: 'El usuario no es administrador de este jugador' });
    }

    // Verificar que no se está quitando al último administrador
    if (jugador.administradores.length === 1) {
      return res.status(400).json({ message: 'No se puede quitar al único administrador' });
    }

    // Quitar el administrador
    jugador.administradores = jugador.administradores.filter(id => id.toString() !== adminId);
    await jugador.save();

    await jugador.populate('administradores', 'email nombre');
    res.status(200).json({ administradores: jugador.administradores });
  } catch (error) {
    console.error('Error al quitar administrador:', error);
    res.status(500).json({ message: 'Error al quitar administrador' });
  }
});


/**
 * @swagger
 * /api/jugadores/{id}:
 *   delete:
 *     summary: Elimina un jugador del sistema
 *     description: |
 *       Elimina permanentemente un jugador y todos sus datos asociados.
 *       
 *       ### Permisos requeridos:
 *       - El usuario debe ser administrador del jugador o tener rol de administrador global
 *       - No se puede eliminar un jugador que tenga relaciones activas (equipos, estadísticas, etc.)
 *     tags: [Jugadores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *           example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *         description: ID único del jugador a eliminar
 *     responses:
 *       200:
 *         description: Jugador eliminado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Jugador eliminado correctamente"
 *                 jugador:
 *                   $ref: '#/components/schemas/Jugador'
 *       400:
 *         description: |
 *           Solicitud inválida. Posibles razones:
 *           - El ID del jugador no es válido
 *           - El jugador tiene relaciones activas que impiden su eliminación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Se requiere autenticación mediante token JWT
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: |
 *           Prohibido - El usuario autenticado no tiene permisos para eliminar este jugador.
 *           Solo los administradores del jugador o los administradores globales pueden realizar esta acción.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No se encontró ningún jugador con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor al procesar la solicitud
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     securitySchemes:
 *       bearerAuth:
 *         type: http
 *         scheme: bearer
 *         bearerFormat: JWT
 */
router.delete('/:id', verificarToken, esAdminDeEntidad(Jugador, 'jugador'), async (req, res) => {
  try {
    const jugador = req.jugador; // Cargado por esAdminDeEntidad
    await jugador.deleteOne();   // ✅ Esto dispara el pre('remove')
    res.status(200).json({ message: 'Jugador eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar jugador' });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/radar:
 *   get:
 *     summary: Obtiene las estadísticas tipo radar del jugador
 *     tags: [Jugadores]
 */
router.get('/:id/radar', async (req, res) => {
  try {
    const { id } = req.params;
    const { modalidad, categoria } = req.query;

    // 1. Get Master Ranking (Level 1)
    const ratingQuery = { playerId: id, competenciaId: null };
    if (modalidad) ratingQuery.modalidad = modalidad;
    if (categoria) ratingQuery.categoria = categoria;

    const masterRating = await PlayerRating.findOne(ratingQuery).lean();
    
    // 1.1. Get Karma Stats
    const karmaStats = await KarmaLog.aggregate([
      { $match: { targetPlayer: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, totalKarma: { $sum: '$points' } } }
    ]);
    const totalKarma = karmaStats.length > 0 ? karmaStats[0].totalKarma : 0;

    // 1.2. Get Plaza Stats (Partidos oficiales que no pertenecen a una competencia/liga)
    const plazaQuery = { 
      playerId: id,
      competenciaId: null 
    };
    if (modalidad) plazaQuery.modalidad = modalidad;
    if (categoria) plazaQuery.categoria = categoria;

    const plazaMatches = await MatchPlayer.countDocuments(plazaQuery);

    // 2. Get Recent Match History to calculate tendency
    const historyQuery = { playerId: id };
    if (modalidad) historyQuery.modalidad = modalidad;
    if (categoria) historyQuery.categoria = categoria;

    const recentMatches = await MatchPlayer.find(historyQuery)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const totalMatches = await MatchPlayer.countDocuments(historyQuery);
    const wins = await MatchPlayer.countDocuments({ ...historyQuery, win: true });
    
    // IF NO MATCHES - Return unranked profile
    if (totalMatches === 0) {
      return res.json({
        power: 0,
        stamina: 0,
        precision: 0,
        consistency: 0,
        versatility: 0,
        elo: 0,
        totalMatches: 0,
        winrate: 0,
        isUnranked: true
      });
    }

    // Competitive Rhythm (Last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const matchesLast30Days = await MatchPlayer.countDocuments({ 
      playerId: id, 
      createdAt: { $gte: thirtyDaysAgo } 
    });
    
    // Power: Based on absolute ELO rating. 2400+ is 100.
    const power = Math.min(100, Math.max(20, ((masterRating?.rating || 1500) - 1000) / 14));
    
    // Stamina (Option A): 50% Veterancy (250 matches) + 50% Rhythm (12 matches last 30 days)
    const veterancy = Math.min(50, (totalMatches / 250) * 50);
    const rhythm = Math.min(50, (matchesLast30Days / 12) * 50);
    const stamina = Math.max(10, veterancy + rhythm);
    
    // Precision: Based on Winrate. 70% winrate is 100.
    const winrate = totalMatches > 0 ? (wins / totalMatches) : 0.5;
    const precision = Math.min(100, Math.max(20, (winrate / 0.7) * 100));
    
    // Consistency: Inverse of delta variance in last 10 matches.
    const lastDeltas = recentMatches.slice(0, 10).map(m => Math.abs(m.delta || 0));
    const avgDelta = lastDeltas.length > 0 ? lastDeltas.reduce((a, b) => a + b, 0) / lastDeltas.length : 15;
    const consistency = Math.min(100, Math.max(20, 100 - (avgDelta * 2)));

    // Versatility: Number of different Competitions played. 5+ is 100.
    const uniqueComps = await MatchPlayer.distinct('competenciaId', { playerId: id });
    const versatility = Math.min(100, Math.max(20, (uniqueComps.filter(c => c).length / 5) * 100));

    res.json({
      power: Math.round(power),
      stamina: Math.round(stamina),
      precision: Math.round(precision),
      consistency: Math.round(consistency),
      versatility: Math.round(versatility),
      elo: masterRating?.rating || 1500,
      totalMatches,
      winrate: Math.round(winrate * 100),
      karma: totalKarma,
      plazaMatches
    });
  } catch (error) {
    console.error('Error in radar calc:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/jugadores/{id}/history:
 *   get:
 *     summary: Obtiene el historial unificado de partidos (Liga y Plaza)
 *     tags: [Jugadores]
 */
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { modalidad, categoria } = req.query;

    const query = { playerId: id };
    if (modalidad) query.modalidad = modalidad;
    if (categoria) query.categoria = categoria;

    const matches = await MatchPlayer.find(query)
      .populate({
        path: 'partidoId',
        select: 'marcadorLocal marcadorVisitante fecha modalidad categoria lobbyId isRanked estado',
        populate: {
          path: 'lobbyId',
          select: 'title location'
        }
      })
      .populate('competenciaId', 'nombre logo verificado')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const formattedHistory = matches.map(m => ({
      id: m._id,
      date: m.partidoId?.fecha || m.createdAt,
      type: m.competenciaId ? 'league' : 'plaza',
      competition: m.competenciaId?.nombre || 'La Plaza',
      organization: m.competenciaId ? m.competenciaId.nombre : (m.partidoId?.lobbyId?.location?.name || 'Varios'),
      logo: m.competenciaId?.logo,
      isVerified: m.competenciaId?.verificado || false,
      modality: m.modalidad || m.partidoId?.modalidad,
      category: m.categoria || m.partidoId?.categoria,
      score: {
        own: m.teamColor === 'rojo' ? m.partidoId?.marcadorLocal : m.partidoId?.marcadorVisitante,
        opponent: m.teamColor === 'rojo' ? m.partidoId?.marcadorVisitante : m.partidoId?.marcadorLocal
      },
      win: m.win,
      delta: m.delta,
      multiplier: m.multiplier
    }));

    res.json(formattedHistory);
  } catch (error) {
    console.error('Error in history endpoint:', error);
    res.status(500).json({ message: 'Error al obtener historial', error: error.message });
  }
});

export default router;
