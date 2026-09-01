import express from 'express';
import mongoose from 'mongoose';
import SolicitudEdicion from '../models/SolicitudEdicion.js';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../middleware/validacionObjectId.js';
// import validarDobleConfirmacion from '../utils/validarDobleConfirmacion.js'; // TODO: Implementar
import { tiposSolicitudMeta } from '../config/solicitudesMeta.js';
import { obtenerAdminsParaSolicitud } from '../services/obtenerAdminsParaSolicitud.js';
import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';
import Jugador from '../models/Jugador/Jugador.js';
import EquipoCompetencia from '../models/Equipo/EquipoCompetencia.js';
import Equipo from '../models/Equipo/Equipo.js';
import ParticipacionTemporada from '../models/Equipo/ParticipacionTemporada.js';
import JugadorTemporada from '../models/Jugador/JugadorTemporada.js';
import Temporada from '../models/Competencia/Temporada.js';
import Competencia from '../models/Competencia/Competencia.js';
import Organizacion from '../models/Organizacion.js';
import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';
import EstadisticasJugadorPartido from '../models/Jugador/EstadisticasJugadorPartido.js';
import EstadisticasJugadorPartidoManual from '../models/Jugador/EstadisticasJugadorPartidoManual.js';
import EstadisticasEquipoPartido from '../models/Equipo/EstadisticasEquipoPartido.js';
import { normalizarVisibilidadObjetivo } from '../services/statsApprovalService.js';
import SetPartido from '../models/Partido/SetPartido.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import { recalcularAgregadosDeJugadorPartido } from '../utils/estadisticasAggregator.js';
import Partido from '../models/Partido/Partido.js';
import TimerManager from '../services/TimerManager.js';
import { hasTeamPermission } from '../services/teamPermissionService.js';
import { hasMatchPermission } from '../services/matchPermissionService.js';

/**
 * @swagger
 * tags:
 *   name: Solicitudes de Edición
 *   description: Gestión de solicitudes de edición para cambios que requieren aprobación
 * 
 * components:
 *   schemas:
 *     SolicitudEdicion:
 *       type: object
 *       required:
 *         - tipo
 *         - datosPropuestos
 *         - creadoPor
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único de la solicitud
 *         tipo:
 *           type: string
 *           enum: [resultadoPartido, resultadoSet, estadisticasJugadorPartido, estadisticasJugadorSet, 
 *                 estadisticasEquipoPartido, estadisticasEquipoSet, jugador-equipo-editar, 
 *                 jugador-equipo-crear, jugador-equipo-eliminar,
 *                 participacion-temporada-crear, participacion-temporada-actualizar, participacion-temporada-eliminar,
 *                 jugador-temporada-crear, jugador-temporada-actualizar, jugador-temporada-eliminar,
 *                 usuario-crear-jugador, usuario-crear-equipo, usuario-crear-organizacion,
 *                 usuario-solicitar-admin-jugador, usuario-solicitar-admin-equipo, usuario-solicitar-admin-organizacion,
 *                 contratoEquipoCompetencia]
 *           description: Tipo de solicitud
 *         entidad:
 *           type: string
 *           format: ObjectId
 *           description: ID de la entidad relacionada (opcional)
 *         datosPropuestos:
 *           type: object
 *           description: Datos propuestos para la edición
 *           example: {}
 *         estado:
 *           type: string
 *           enum: [pendiente, aceptado, rechazado, cancelado]
 *           default: pendiente
 *         aceptadoPor:
 *           type: array
 *           items:
 *             type: string
 *             format: ObjectId
 *             description: IDs de usuarios que han aprobado la solicitud
 *         requiereDobleConfirmacion:
 *           type: boolean
 *           default: false
 *         motivoRechazo:
 *           type: string
 *           description: Motivo del rechazo si es aplicable
 *         fechaAceptacion:
 *           type: string
 *           format: date-time
 *         fechaRechazo:
 *           type: string
 *           format: date-time
 *         creadoPor:
 *           type: string
 *           format: ObjectId
 *           description: ID del usuario que creó la solicitud
 *         aprobadoPor:
 *           type: string
 *           format: ObjectId
 *           description: ID del usuario que aprobó la solicitud
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const router = express.Router();
const { Types } = mongoose;

/**
 * @swagger
 * /api/solicitudes-edicion:
 *   get:
 *     summary: Obtiene todas las solicitudes de edición con filtros opcionales
 *     tags: [Solicitudes de Edición]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [resultadoPartido, resultadoSet, estadisticasJugadorPartido, 
 *                 estadisticasJugadorSet, estadisticasEquipoPartido, 
 *                 estadisticasEquipoSet, jugador-equipo-editar, 
 *                 jugador-equipo-crear, jugador-equipo-eliminar, participacion-temporada-crear, 
 *                 participacion-temporada-actualizar, participacion-temporada-eliminar, jugador-temporada-crear, 
 *                 jugador-temporada-actualizar, jugador-temporada-eliminar, usuario-crear-jugador, usuario-crear-equipo, 
 *                 usuario-crear-organizacion, usuario-solicitar-admin-jugador, usuario-solicitar-admin-equipo, usuario-solicitar-admin-organizacion,
 *                 contratoEquipoCompetencia]
 *         description: Filtro por tipo de solicitud
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [pendiente, aceptado, rechazado, cancelado]
 *         description: Filtro por estado de la solicitud
 *       - in: query
 *         name: creadoPor
 *         schema:
 *           type: string
 *         description: Filtro por ID del usuario que creó la solicitud
 *       - in: query
 *         name: entidad
 *         schema:
 *           type: string
 *         description: Filtro por ID de la entidad relacionada
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Número de elementos por página
 *     responses:
 *       200:
 *         description: Lista de solicitudes de edición
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 solicitudes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SolicitudEdicion'
 *                 total:
 *                   type: integer
 *                   description: Total de solicitudes
 *                 page:
 *                   type: integer
 *                   description: Página actual
 *                 limit:
 *                   type: integer
 *                   description: Elementos por página
 *                 totalPages:
 *                   type: integer
 *                   description: Total de páginas
 */
/**
 * @swagger
 * /api/solicitudes-edicion:
 *   get:
 *     summary: Lista solicitudes de edición del usuario
 *     description: Obtiene todas las solicitudes de edición creadas por el usuario autenticado o que requieren su aprobación
 *     tags: [SolicitudesEdicion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de solicitudes obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SolicitudEdicion'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error al obtener solicitudes
 */
router.get('/', verificarToken, async (req, res) => {
  try {
    const { tipo, estado, creadoPor, entidad, scope, page = 1, limit = 10 } = req.query;
    const filtro = {
      ...(tipo ? { tipo } : {}),
      ...(estado ? { estado } : {}),
      ...(creadoPor ? { creadoPor } : {}),
      ...(entidad ? { entidad } : {}),
    };

    const uid = req.user?.uid;
    const esAdminGlobal = req.user?.rol === 'admin';

    // Scoping para usuarios no admin (refinado)
    if (!esAdminGlobal) {
      if (scope === 'mine') {
        filtro.creadoPor = uid;
      } else if (scope === 'related' || scope === 'aprobables') {
        // No restringimos con $or en la query para no perder solicitudes donde el usuario sea aprobador
        // Se hará filtrado preciso luego en memoria.
      }
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    let solicitudes = await SolicitudEdicion.find(filtro)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('creadoPor', 'nombre email')
      .lean();

    // Post-filtrado para scope=related: mantener creadas por el usuario o donde sea aprobador dinámico
    if (!esAdminGlobal && scope === 'related') {
      const visibles = [];
      for (const s of solicitudes) {
        if (s.creadoPor?.toString() === uid) { visibles.push(s); continue; }
        try {
          const aprobadores = await obtenerAdminsParaSolicitud(s);
          const puede = Object.values(aprobadores).some(grupo => grupo.some(adminId => adminId.toString() === uid));
          if (puede) visibles.push(s);
        } catch {/* ignorar */}
      }
      solicitudes = visibles;
    }

    if (!esAdminGlobal && scope === 'aprobables') {
      const filtradas = [];
      for (const s of solicitudes) {
        try {
          const aprobadores = await obtenerAdminsParaSolicitud(s);
          const puede = Object.values(aprobadores).some(grupo =>
            grupo.some(adminId => adminId.toString() === uid)
          );
          if (puede) filtradas.push(s);
        } catch (e) {
          continue;
        }
      }
      solicitudes = filtradas;
    }

    // Recalcular total considerando post-filtrado (cuando scope related/aprobables)
    let total;
    if (!esAdminGlobal && (scope === 'related' || scope === 'aprobables')) {
      total = solicitudes.length;
    } else {
      total = await SolicitudEdicion.countDocuments(filtro);
    }
    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      solicitudes,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener solicitudes', error: error.message });
  }
});

/**
 * @swagger
 * /api/solicitudes-edicion/opciones:
 *   get:
 *     summary: Tipos de solicitud disponibles para un contexto
 *     tags: [Solicitudes de Edición]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: contexto
 *         schema:
 *           type: string
 *           enum: [usuario, jugador, equipo, organizacion, competencia, temporada, fase, partido]
 *         required: true
 *       - in: query
 *         name: entidadId
 *         schema:
 *           type: string
 *           format: ObjectId
 *         required: false
 *     responses:
 *       200:
 *         description: Lista de tipos disponibles con metadatos
 */
/**
 * @swagger
 * /api/solicitudes-edicion/opciones:
 *   get:
 *     summary: Obtiene opciones para crear solicitudes
 *     description: Retorna las entidades y campos disponibles para crear solicitudes de edición
 *     tags: [SolicitudesEdicion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Opciones obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entidades:
 *                   type: array
 *                   items:
 *                     type: string
 *                 camposPorEntidad:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/opciones', verificarToken, async (req, res) => {
  try {
    const { contexto, entidadId } = req.query;
    if (!contexto) return res.status(400).json({ message: 'contexto requerido' });

    // Mapa básico de tipos por contexto. Se puede refinar por permisos/entidad
    const porContexto = {
      usuario: [
        'usuario-crear-jugador', 'usuario-crear-equipo', 'usuario-crear-organizacion',
      ],
      jugador: [
        'jugador-equipo-crear', 'jugador-equipo-eliminar', 'jugador-equipo-editar', 'usuario-solicitar-admin-jugador',
      ],
      equipo: [
        'jugador-equipo-crear', 'jugador-equipo-eliminar', 'jugador-equipo-editar',
        'contratoEquipoCompetencia',
        'participacion-temporada-crear', 'participacion-temporada-actualizar', 'participacion-temporada-eliminar',
        'jugador-temporada-crear', 'jugador-temporada-actualizar', 'jugador-temporada-eliminar',
        'usuario-solicitar-admin-equipo',
      ],
      organizacion: [
        'usuario-solicitar-admin-organizacion',
      ],
      competencia: [
        'contratoEquipoCompetencia',
        'participacion-temporada-crear', 'participacion-temporada-actualizar', 'participacion-temporada-eliminar',
        'jugador-temporada-crear', 'jugador-temporada-actualizar', 'jugador-temporada-eliminar',
      ],
      temporada: [
        'participacion-temporada-crear', 'participacion-temporada-actualizar', 'participacion-temporada-eliminar',
        'jugador-temporada-crear', 'jugador-temporada-actualizar', 'jugador-temporada-eliminar',
      ],
      fase: [
        'resultadoPartido', 'editarPartidoCompetencia', 'resultadoSet', 'estadisticasJugadorPartido', 'estadisticasJugadorSet', 'estadisticasEquipoPartido', 'estadisticasEquipoSet'
      ],
      partido: [
        'resultadoPartido', 'editarPartidoCompetencia', 'resultadoSet', 'estadisticasJugadorPartido', 'estadisticasJugadorSet', 'estadisticasEquipoPartido', 'estadisticasEquipoSet'
      ],
    };

    let tipos = porContexto[contexto] || [];
    // Filtrar por los realmente definidos en meta (defensa)
    tipos = tipos.filter(t => !!tiposSolicitudMeta[t]);

    const resultado = tipos.map(t => ({
      tipo: t,
      meta: tiposSolicitudMeta[t],
    }));

    return res.json({ contexto, entidadId: entidadId || null, tiposDisponibles: resultado });
  } catch (error) {
    console.error('Error en GET /solicitudes-edicion/opciones:', error);
    res.status(500).json({ message: 'Error al obtener opciones', error: error.message });
  }
});

/**
 * @swagger
 * /api/solicitudes-edicion/{id}:
 *   get:
 *     summary: Obtiene una solicitud de edición por ID
 *     tags: [Solicitudes de Edición]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la solicitud
 *     responses:
 *       200:
 *         description: Solicitud encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SolicitudEdicion'
 *       404:
 *         description: Solicitud no encontrada
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
/**
 * @swagger
 * /api/solicitudes-edicion/{id}:
 *   get:
 *     summary: Obtiene una solicitud específica
 *     description: Retorna los detalles completos de una solicitud de edición por su ID
 *     tags: [SolicitudesEdicion]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la solicitud
 *     responses:
 *       200:
 *         description: Solicitud encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SolicitudEdicion'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Solicitud no encontrada
 *       500:
 *         description: Error al obtener solicitud
 */
router.get('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const solicitud = await SolicitudEdicion.findById(req.params.id).lean();
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' });
    res.status(200).json(solicitud);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener solicitud', error: error.message });
  }
});

/**
 * @swagger
 * /api/solicitudes-edicion/{id}/aprobadores:
 *   get:
 *     summary: Obtiene los usuarios que pueden aprobar una solicitud específica
 *     tags: [Solicitudes de Edición]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la solicitud
 *     responses:
 *       200:
 *         description: Lista de usuarios que pueden aprobar la solicitud
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 aprobadores:
 *                   type: object
 *                   properties:
 *                     administradores:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: ObjectId
 *                         description: IDs de administradores
 *                     organizacion:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: ObjectId
 *                         description: IDs de administradores de organización
 *                     global:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: ObjectId
 *                         description: IDs de administradores globales
 *                 puedeAprobar:
 *                   type: boolean
 *                   description: Si el usuario actual puede aprobar la solicitud
 *       404:
 *         description: Solicitud no encontrada
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error al obtener los aprobadores
 */
router.get('/:id/aprobadores', verificarToken, validarObjectId, async (req, res) => {
  try {
    const solicitud = await SolicitudEdicion.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' });

    // Obtener los administradores que pueden aprobar esta solicitud
    const aprobadoresResult = await obtenerAdminsParaSolicitud(solicitud.tipo, solicitud.entidad, solicitud.datosPropuestos);
    const aprobadores = aprobadoresResult.grupos || {};

    // Verificar si el usuario actual puede aprobar
    const uid = req.user.uid;
    const puedeAprobar = Object.values(aprobadores).some(grupo =>
      grupo.some(adminId => adminId.toString() === uid)
    );

    res.status(200).json({
      aprobadores,
      puedeAprobar
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener aprobadores', error: error.message });
  }
});

/**
 * @swagger
 * /api/solicitudes-edicion:
 *   post:
 *     summary: Crea una nueva solicitud de edición
 *     tags: [Solicitudes de Edición]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipo
 *               - datosPropuestos
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [resultadoPartido, resultadoSet, estadisticasJugadorPartido, 
 *                       estadisticasJugadorSet, estadisticasEquipoPartido, 
 *                       estadisticasEquipoSet, jugador-equipo-editar, 
 *                       jugador-equipo-crear, jugador-equipo-eliminar, participacion-temporada-crear, 
 *                       participacion-temporada-actualizar, participacion-temporada-eliminar, jugador-temporada-crear, 
 *                       jugador-temporada-actualizar, jugador-temporada-eliminar, usuario-crear-jugador, usuario-crear-equipo, 
  *                       usuario-crear-organizacion, usuario-solicitar-admin-jugador, usuario-solicitar-admin-equipo, usuario-solicitar-admin-organizacion,
  *                       contratoEquipoCompetencia]
 *                 description: Tipo de solicitud
 *               entidad:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID de la entidad relacionada (opcional)
 *               datosPropuestos:
 *                 type: object
 *                 description: Datos propuestos para la edición
 *     responses:
 *       201:
 *         description: Solicitud creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SolicitudEdicion'
 *       400:
 *         description: Faltan campos requeridos o tipo de solicitud no válido
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error al crear la solicitud
 */
router.post('/', verificarToken, async (req, res) => {
  try {
    const { tipo, entidad, datosPropuestos } = req.body;
    const creadoPor = req.user.uid;

    console.log('POST /solicitudes-edicion - Datos recibidos:', { tipo, entidad, datosPropuestos, creadoPor });

    if (!creadoPor) {
      return res.status(401).json({ message: 'Usuario no identificado' });
    }

    if (!tipo || !datosPropuestos) {
      return res.status(400).json({ message: 'Faltan campos requeridos: tipo y datosPropuestos' });
    }

    const tiposPermitidos = Object.keys(tiposSolicitudMeta);

    if (!tiposPermitidos.includes(tipo)) {
      return res.status(400).json({ message: `Tipo de solicitud no válido: ${tipo}` });
    }

    // Validar estructura de datosPropuestos según el tipo
    if (tipo === 'jugador-equipo-crear' && !datosPropuestos.jugadorId) {
      return res.status(400).json({ message: 'jugadorId requerido para solicitudes de creación' });
    }
    if (tipo === 'jugador-equipo-eliminar' && !datosPropuestos.contratoId) {
      return res.status(400).json({ message: 'contratoId requerido para solicitudes de eliminación' });
    }
    if (tipo === 'jugador-equipo-editar' && !entidad) {
      return res.status(400).json({ message: 'entidad (contratoId) requerida para solicitudes de edición' });
    }

    // Evitar solicitudes duplicadas pendientes del mismo usuario para la misma entidad y tipo
    const tiposConAntiDuplicado = [
      'usuario-solicitar-admin-equipo',
      'usuario-solicitar-admin-organizacion',
      'usuario-solicitar-admin-jugador',
      'jugador-claim',
    ];
    if (tiposConAntiDuplicado.includes(tipo) && entidad) {
      const existente = await SolicitudEdicion.findOne({
        tipo,
        entidad,
        creadoPor,
        estado: 'pendiente',
      });
      if (existente) {
        return res.status(409).json({ message: 'Ya tenés una solicitud pendiente de este tipo para esta entidad.' });
      }
    }

    // Propuesta de estadísticas: validar la forma y que quien propone tenga algo
    // que ver con el partido. Sin esto, cualquier usuario con sesión podría dejar
    // una propuesta esperando sobre cualquier partido.
    const esPropuestaDeStats = ['estadisticas-set-propuesta', 'estadisticas-partido-propuesta'].includes(tipo);
    if (esPropuestaDeStats) {
      if (!entidad) {
        return res.status(400).json({ message: 'entidad (el id del partido) es requerida' });
      }

      if (tipo === 'estadisticas-set-propuesta') {
        if (!datosPropuestos.setId) {
          return res.status(400).json({ message: 'setId es requerido' });
        }
        const filasLocal = Array.isArray(datosPropuestos.estadisticasLocal) ? datosPropuestos.estadisticasLocal : [];
        const filasVisitante = Array.isArray(datosPropuestos.estadisticasVisitante) ? datosPropuestos.estadisticasVisitante : [];
        if (filasLocal.length === 0 && filasVisitante.length === 0) {
          return res.status(400).json({ message: 'La propuesta no incluye ninguna estadística' });
        }
      } else {
        const filas = Array.isArray(datosPropuestos.estadisticas) ? datosPropuestos.estadisticas : [];
        if (filas.length === 0) {
          return res.status(400).json({ message: 'La propuesta no incluye ninguna estadística' });
        }
      }

      const partido = await Partido.findById(entidad).select('equipoLocal equipoVisitante competencia').lean();
      if (!partido) {
        return res.status(404).json({ message: 'Partido no encontrado' });
      }
      if (!partido.competencia) {
        return res.status(400).json({
          message: 'En un amistoso las estadísticas se cargan directo, no hace falta una propuesta.',
        });
      }

      const equiposDelPartido = [partido.equipoLocal, partido.equipoVisitante].filter(Boolean);
      let puedeProponer = await hasMatchPermission({
        partidoId: entidad,
        usuarioId: creadoPor,
        rolGlobal: req.user?.rol,
        permission: 'match.stats',
      });

      if (!puedeProponer) {
        for (const equipoId of equiposDelPartido) {
          const puede = await hasTeamPermission({
            equipoId: String(equipoId),
            usuarioId: creadoPor,
            rolGlobal: req.user?.rol,
            permission: 'stats.capture',
          });
          if (puede) {
            puedeProponer = true;
            break;
          }
        }
      }

      if (!puedeProponer) {
        return res.status(403).json({
          message: 'Necesitás poder capturar estadísticas de alguno de los equipos del partido',
        });
      }
    }

    // Un equipo creado self-service arranca sin verificar: puede gestionar plantilla,
    // amistosos y estadísticas, pero no entrar a una competencia hasta que un Super
    // Admin lo valide. Ver PUT /api/equipos/:id/verificacion.
    const tiposQueExigenEquipoVerificado = [
      'participacion-temporada-crear',
      'contratoEquipoCompetencia',
    ];
    if (tiposQueExigenEquipoVerificado.includes(tipo)) {
      const equipoId = datosPropuestos.equipo || datosPropuestos.equipoId;
      if (equipoId) {
        const equipo = await Equipo.findById(equipoId).select('verificado nombre').lean();
        if (equipo && !equipo.verificado) {
          return res.status(403).json({
            message: 'Tu equipo todavía no está verificado. Un administrador de Overtime tiene que validarlo antes de que puedas inscribirlo a una competencia.',
            codigo: 'EQUIPO_NO_VERIFICADO',
          });
        }
      }
    }

    // Para equipos: rechazar si ya tiene suficientes admins
    const MAX_ADMINS_EQUIPO = 3;
    if (tipo === 'usuario-solicitar-admin-equipo' && entidad) {
      const equipo = await Equipo.findById(entidad).select('administradores creadoPor').lean();
      if (equipo) {
        const totalAdmins = new Set([
          ...(equipo.administradores || []).map(id => id.toString()),
          equipo.creadoPor?.toString(),
        ].filter(Boolean)).size;
        if (totalAdmins >= MAX_ADMINS_EQUIPO) {
          return res.status(400).json({ message: 'Este equipo ya tiene suficientes administradores.' });
        }
      }
    }

    const solicitud = new SolicitudEdicion({
      tipo,
      entidad: entidad || null,
      datosPropuestos,
      creadoPor,
    });

    console.log('Guardando solicitud:', solicitud);

    const savedSolicitud = await solicitud.save();
    console.log('Solicitud guardada exitosamente:', savedSolicitud);
    res.status(201).json(savedSolicitud);
  } catch (error) {
    console.error('Error completo al crear solicitud:', error);
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});


/**
 * @swagger
 * /api/solicitudes-edicion/{id}:
 *   put:
 *     summary: Actualiza una solicitud de edición (aprobar/rechazar)
 *     tags: [Solicitudes de Edición]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la solicitud a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - estado
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [aceptado, rechazado]
 *                 description: Nuevo estado de la solicitud
 *               motivoRechazo:
 *                 type: string
 *                 description: Motivo del rechazo (requerido si estado es 'rechazado')
 *               datosPropuestos:
 *                 type: object
 *                 description: Datos propuestos actualizados (opcional)
 *     responses:
 *       200:
 *         description: Solicitud actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SolicitudEdicion'
 *       400:
 *         description: Estado inválido o solicitud ya procesada
 *       403:
 *         description: No autorizado para gestionar esta solicitud
 *       404:
 *         description: Solicitud no encontrada
 *       500:
 *         description: Error al actualizar la solicitud
 */
/**
 * @swagger
 * /api/solicitudes-edicion/{id}:
 *   put:
 *     summary: Aprueba o rechaza una solicitud
 *     description: Permite a un administrador aprobar o rechazar una solicitud de edición pendiente
 *     tags: [SolicitudesEdicion]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la solicitud
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - estado
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [aprobada, rechazada]
 *                 description: Nueva estado de la solicitud
 *               motivoRechazo:
 *                 type: string
 *                 description: Motivo del rechazo (requerido si estado=rechazada)
 *     responses:
 *       200:
 *         description: Solicitud actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SolicitudEdicion'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: No autorizado para aprobar esta solicitud
 *       404:
 *         description: Solicitud no encontrada
 *       500:
 *         description: Error al procesar solicitud
 */
router.put('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const { estado, motivoRechazo, datosPropuestos } = req.body;
    const uid = req.user.uid;

    console.log('PUT /solicitudes-edicion/:id - Request:', {
      id: req.params.id,
      estado,
      motivoRechazo,
      datosPropuestos,
      uid
    });

    const solicitud = await SolicitudEdicion.findById(req.params.id);
    if (!solicitud) {
      console.log('Solicitud no encontrada:', req.params.id);
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }

    console.log('Solicitud encontrada:', {
      id: solicitud._id,
      tipo: solicitud.tipo,
      estado: solicitud.estado,
      entidad: solicitud.entidad,
      creadoPor: solicitud.creadoPor
    });

    if (solicitud.estado !== 'pendiente') {
      console.log('Solicitud ya procesada:', solicitud.estado);
      return res.status(400).json({ message: 'Solicitud ya procesada' });
    }

    // Obtener admins responsables usando el servicio centralizado
    console.log('Determinando admins para solicitud tipo:', solicitud.tipo);

    const { grupos, all: allAdmins } = await obtenerAdminsParaSolicitud(solicitud.tipo, solicitud.entidad, solicitud.datosPropuestos);
    let admins = allAdmins; // Por defecto, todos los involucrados

    const resolverAprobadores = (creador, adminsA, adminsB) => {
      const esA = adminsA.includes(creador);
      const esB = adminsB.includes(creador);
      // Lógica cruzada: Si crea A, aprueba B. Si crea B, aprueba A.
      if (esA && !esB) return adminsB;
      if (esB && !esA) return adminsA;
      // Si es ambos o ninguno, por defecto la autoridad B (generalmente la entidad destino o superior)
      return adminsB;
    };

    if (solicitud.tipo.startsWith('jugador-equipo-')) {
      // 1. Fichajes (Jugador <-> Equipo)
      admins = (grupos.equipo?.length || grupos.jugador?.length)
        ? resolverAprobadores(solicitud.creadoPor?.toString(), grupos.equipo || [], grupos.jugador || [])
        : (grupos.global || []); // equipo y jugador huérfanos: fallback a admins globales

    } else if (solicitud.tipo.startsWith('participacion-temporada-')) {
      // 2. Torneos (Equipo <-> Competencia)
      admins = (grupos.equipo?.length || grupos.competencia?.length)
        ? resolverAprobadores(solicitud.creadoPor?.toString(), grupos.equipo || [], grupos.competencia || [])
        : (grupos.global || []); // equipo y competencia huérfanos: fallback a admins globales

    } else if (solicitud.tipo.startsWith('jugador-temporada-')) {
      // 3. Listas de Buena Fe (Equipo <-> Competencia)
      admins = (grupos.equipo?.length || grupos.competencia?.length)
        ? resolverAprobadores(solicitud.creadoPor?.toString(), grupos.equipo || [], grupos.competencia || [])
        : (grupos.global || []); // equipo y competencia huérfanos: fallback a admins globales

    } else if (solicitud.tipo.startsWith('usuario-crear-')) {
        // Requiere admin del sistema
        if (req.user.rol !== 'admin') {
          return res.status(403).json({ message: 'Solo admin puede gestionar estas solicitudes' });
        }
        admins = [uid];
      }

    // Autorización: sólo aprobadores (o admin global) pueden gestionar la solicitud
    console.log('Verificando autorización:', {
      admins: admins.map(id => id?.toString?.() || id),
      uid,
      userRol: req.user.rol,
      isAdmin: req.user.rol === 'admin',
      solicitudId: solicitud._id,
      solicitudTipo: solicitud.tipo,
      solicitudEntidad: solicitud.entidad
    });

    if (!admins.map(id => id?.toString?.() || id).includes(uid) && req.user.rol !== 'admin') {
      console.log('Usuario no autorizado - detalles:', {
        uid,
        admins,
        userRol: req.user.rol,
        solicitudCreadoPor: solicitud.creadoPor
      });
      return res.status(403).json({ message: 'No autorizado para gestionar esta solicitud' });
    }

    console.log('Usuario autorizado, procesando solicitud con estado:', estado);

    const esSolicitudPublicacionStats = [
      'estadisticasJugadorSet',
      'estadisticasJugadorPartido',
      'estadisticasEquipoPartido',
    ].includes(solicitud.tipo);

    if (estado === 'rechazado') {
      solicitud.estado = 'rechazado';
      solicitud.motivoRechazo = motivoRechazo;
      solicitud.fechaRechazo = new Date();

      if (esSolicitudPublicacionStats && solicitud.entidad) {
        const rechazoPayload = {
          estadoPublicacion: 'rechazada',
          solicitudPublicacion: solicitud._id,
        };

        // Marcar la fila como rechazada no alcanzaba: los agregados ya la habían
        // sumado, y nada los volvía a calcular. El aporte del dato rechazado
        // quedaba dentro de los totales para siempre.
        if (solicitud.tipo === 'estadisticasJugadorSet') {
          const stat = await EstadisticasJugadorSet.findByIdAndUpdate(
            solicitud.entidad,
            rechazoPayload,
            { new: true },
          );
          if (stat?.jugadorPartido) {
            await recalcularAgregadosDeJugadorPartido(stat.jugadorPartido, uid);
          }
        } else if (solicitud.tipo === 'estadisticasJugadorPartido') {
          const stat = await EstadisticasJugadorPartido.findByIdAndUpdate(
            solicitud.entidad,
            rechazoPayload,
            { new: true },
          );
          await EstadisticasJugadorPartidoManual.findByIdAndUpdate(solicitud.entidad, rechazoPayload);
          if (stat?.jugadorPartido) {
            await recalcularAgregadosDeJugadorPartido(stat.jugadorPartido, uid);
          }
        } else if (solicitud.tipo === 'estadisticasEquipoPartido') {
          await EstadisticasEquipoPartido.findByIdAndUpdate(solicitud.entidad, rechazoPayload);
        }
      }
      // Podríamos guardar quién rechazó si agregamos el campo al esquema, por ahora solo fecha y motivo.
    } else if (estado === 'aceptado') {
      const requiereDobleConfirmacion = tiposSolicitudMeta[solicitud.tipo]?.requiereDobleConfirmacion ?? false;

      // Determinar número mínimo de aprobaciones necesarias.
      // Preferir 2 cuando se requiere doble confirmación, pero no más que el número de admins determinados.
      const meta = tiposSolicitudMeta[solicitud.tipo] || {};
      const aprobadoresDisponibles = Array.isArray(admins) ? admins.length : 0;
      const aprobacionesNecesarias = requiereDobleConfirmacion ? Math.min(2, Math.max(1, aprobadoresDisponibles)) : 1;

      // Si requiere doble confirmación agregamos el uid a la lista si no está
      if (requiereDobleConfirmacion) {
        if (!solicitud.aceptadoPor.map(id => id?.toString?.()).includes(uid)) {
          solicitud.aceptadoPor.push(uid);
        }

        if (solicitud.aceptadoPor.length >= aprobacionesNecesarias) {
          solicitud.estado = 'aceptado';
          solicitud.fechaAceptacion = new Date();
          solicitud.aprobadoPor = uid; // último que aprobó
        } else {
          solicitud.estado = 'pendiente';
        }
      } else {
        solicitud.estado = 'aceptado';
        solicitud.fechaAceptacion = new Date();
        solicitud.aprobadoPor = uid;
      }

      // Actualizar datosPropuestos si vienen
      if (datosPropuestos) {
        solicitud.datosPropuestos = datosPropuestos;
      }

      // JugadorPartido afectados por una propuesta de estadísticas. Los agregados
      // se rehacen DESPUÉS de commitear: el aggregator no recibe la sesión, así
      // que adentro de la transacción leería datos que todavía no están visibles.
      const jugadorPartidosARecalcular = new Set();

      // TimerManager guarda el estado del partido en memoria: si se tocan los sets
      // hay que avisarle, igual que hace la ruta directa de sets.
      const partidosARecargarEnTimer = new Set();

      // Aplicar cambios a la entidad si corresponde. Hacemos las operaciones que modifican datos
      // dentro de una transacción para asegurar atomicidad entre la solicitud y las entidades.
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          // Guardar estado intermedio de solicitud (aceptadoPor/estado) dentro de la transacción
          await solicitud.save({ session });

          if (solicitud.tipo === 'resultadoSet') {
            // Este tipo nunca tuvo rama de aplicación: caía en el `else` final y
            // aprobar la creación, edición o borrado de un set no hacía nada.
            const datos = solicitud.datosPropuestos || {};
            const partidoId = solicitud.entidad;
            const accion = datos.accion;

            if (accion === 'crear') {
              const numeroSet = Number(datos.numeroSet);
              if (!Number.isFinite(numeroSet)) {
                throw new Error('La propuesta no indica un número de set válido');
              }

              // El índice {partido, numeroSet} es único: si alguien ya creó ese set
              // mientras la solicitud esperaba, no es un error, ya está hecho.
              const existente = await SetPartido.findOne({ partido: partidoId, numeroSet })
                .session(session)
                .lean();

              if (!existente) {
                await SetPartido.create([{
                  partido: partidoId,
                  numeroSet,
                  estadoSet: datos.estadoSet || 'en_juego',
                  ganadorSet: datos.ganadorSet || 'pendiente',
                  creadoPor: solicitud.creadoPor,
                }], { session });
              }

              partidosARecargarEnTimer.add(String(partidoId));

            } else if (accion === 'actualizar') {
              const set = await SetPartido.findById(datos.setId).session(session);
              if (!set) {
                throw new Error('El set de la propuesta ya no existe');
              }
              if (String(set.partido) !== String(partidoId)) {
                throw new Error('El set no pertenece al partido de la solicitud');
              }

              // Lista blanca: datosPropuestos se arma en el cliente, así que no se
              // vuelca entero sobre el documento.
              for (const campo of ['ganadorSet', 'estadoSet', 'numeroSet']) {
                if (datos[campo] !== undefined) set[campo] = datos[campo];
              }
              // save() y no findByIdAndUpdate: el pre('validate') del schema cierra
              // el set solo cuando se le carga un ganador.
              await set.save({ session });

              partidosARecargarEnTimer.add(String(partidoId));

            } else if (accion === 'eliminar') {
              const set = await SetPartido.findById(datos.setId).session(session);

              if (set) {
                if (String(set.partido) !== String(partidoId)) {
                  throw new Error('El set no pertenece al partido de la solicitud');
                }

                // Las estadísticas del set se borran con él. Si quedaran huérfanas
                // seguirían sumando: el aggregator agrupa por jugadorPartido, no por
                // set, así que no notaría que el set ya no existe.
                const statsDelSet = await EstadisticasJugadorSet.find({ set: set._id })
                  .select('jugadorPartido')
                  .session(session)
                  .lean();

                for (const stat of statsDelSet) {
                  if (stat.jugadorPartido) jugadorPartidosARecalcular.add(String(stat.jugadorPartido));
                }

                await EstadisticasJugadorSet.deleteMany({ set: set._id }, { session });
                await set.deleteOne({ session });

                partidosARecargarEnTimer.add(String(partidoId));
              }

            } else {
              throw new Error('La propuesta no indica una acción válida sobre el set');
            }

          } else if (solicitud.tipo === 'estadisticas-set-propuesta') {
            // Los números vienen en datosPropuestos y todavía no existen como
            // filas: recién acá se materializan. Hasta que un aprobador pase por
            // este punto, los totales del partido no se movieron.
            const datos = solicitud.datosPropuestos || {};
            const visibilidad = normalizarVisibilidadObjetivo(datos.visibilidadObjetivo);

            const set = await SetPartido.findById(datos.setId).select('partido').session(session).lean();
            if (!set) {
              throw new Error('El set de la propuesta ya no existe');
            }
            if (String(set.partido) !== String(solicitud.entidad)) {
              throw new Error('El set no pertenece al partido de la solicitud');
            }

            const propuestas = [
              ...(Array.isArray(datos.estadisticasLocal) ? datos.estadisticasLocal : []),
              ...(Array.isArray(datos.estadisticasVisitante) ? datos.estadisticasVisitante : []),
            ];

            for (const item of propuestas) {
              const jugadorPartidoId = item?.jugadorPartidoId;
              if (!jugadorPartidoId) continue;

              const jp = await JugadorPartido.findById(jugadorPartidoId)
                .select('partido equipo jugador')
                .session(session)
                .lean();
              if (!jp) continue;

              // Sin esto, una solicitud aprobada podría escribir estadísticas en
              // el partido de otro con solo mandar un jugadorPartido ajeno.
              if (String(jp.partido) !== String(set.partido)) {
                throw new Error('Un jugador de la propuesta no pertenece a este partido');
              }

              const valores = item.estadisticas || {};
              await EstadisticasJugadorSet.findOneAndUpdate(
                { set: datos.setId, jugadorPartido: jugadorPartidoId },
                {
                  set: datos.setId,
                  jugadorPartido: jugadorPartidoId,
                  jugador: jp.jugador,
                  equipo: jp.equipo,
                  throws: Number(valores.throws) || 0,
                  hits: Number(valores.hits) || 0,
                  outs: Number(valores.outs) || 0,
                  catches: Number(valores.catches) || 0,
                  survive: Boolean(valores.survive),
                  estadoPublicacion: visibilidad,
                  visibilidadObjetivo: visibilidad,
                  solicitudPublicacion: solicitud._id,
                  creadoPor: solicitud.creadoPor,
                },
                { upsert: true, new: true, setDefaultsOnInsert: true, session },
              );

              jugadorPartidosARecalcular.add(String(jugadorPartidoId));
            }
          } else if (solicitud.tipo === 'estadisticas-partido-propuesta') {
            // Captura directa: los totales del partido se cargan a mano, sin sets.
            // Van a la colección manual, que es la que lee `modoVisualizacion`.
            // No se tocan los agregados automáticos: no derivan de esto.
            const datos = solicitud.datosPropuestos || {};
            const visibilidad = normalizarVisibilidadObjetivo(datos.visibilidadObjetivo);
            const filas = Array.isArray(datos.estadisticas) ? datos.estadisticas : [];

            for (const item of filas) {
              const jugadorPartidoId = item?.jugadorPartido;
              if (!jugadorPartidoId) continue;

              const jp = await JugadorPartido.findById(jugadorPartidoId)
                .select('partido')
                .session(session)
                .lean();
              if (!jp) continue;

              if (String(jp.partido) !== String(solicitud.entidad)) {
                throw new Error('Un jugador de la propuesta no pertenece a este partido');
              }

              await EstadisticasJugadorPartidoManual.findOneAndUpdate(
                { jugadorPartido: jugadorPartidoId },
                {
                  jugadorPartido: jugadorPartidoId,
                  throws: Number(item.throws) || 0,
                  hits: Number(item.hits) || 0,
                  outs: Number(item.outs) || 0,
                  catches: Number(item.catches) || 0,
                  fuente: 'ingreso-manual',
                  ultimaActualizacion: new Date(),
                  estadoPublicacion: visibilidad,
                  visibilidadObjetivo: visibilidad,
                  solicitudPublicacion: solicitud._id,
                  creadoPor: solicitud.creadoPor,
                },
                { upsert: true, new: true, setDefaultsOnInsert: true, session },
              );
            }
          } else if (solicitud.tipo === 'estadisticasJugadorSet') {
            const visibilidad = normalizarVisibilidadObjetivo(solicitud.datosPropuestos?.visibilidadObjetivo);
            await EstadisticasJugadorSet.findByIdAndUpdate(
              solicitud.entidad,
              {
                estadoPublicacion: visibilidad,
                visibilidadObjetivo: visibilidad,
                solicitudPublicacion: solicitud._id,
              },
              { session },
            );
          } else if (solicitud.tipo === 'estadisticasJugadorPartido') {
            const visibilidad = normalizarVisibilidadObjetivo(solicitud.datosPropuestos?.visibilidadObjetivo);
            await EstadisticasJugadorPartido.findByIdAndUpdate(
              solicitud.entidad,
              {
                estadoPublicacion: visibilidad,
                visibilidadObjetivo: visibilidad,
                solicitudPublicacion: solicitud._id,
              },
              { session },
            );
            await EstadisticasJugadorPartidoManual.findByIdAndUpdate(
              solicitud.entidad,
              {
                estadoPublicacion: visibilidad,
                visibilidadObjetivo: visibilidad,
                solicitudPublicacion: solicitud._id,
              },
              { session },
            );
          } else if (solicitud.tipo === 'estadisticasEquipoPartido') {
            const visibilidad = normalizarVisibilidadObjetivo(solicitud.datosPropuestos?.visibilidadObjetivo);
            await EstadisticasEquipoPartido.findByIdAndUpdate(
              solicitud.entidad,
              {
                estadoPublicacion: visibilidad,
                visibilidadObjetivo: visibilidad,
                solicitudPublicacion: solicitud._id,
              },
              { session },
            );
          } else if (solicitud.tipo === 'jugador-equipo-crear') {
            const { jugadorId, equipoId, rol, numeroCamiseta, fechaInicio, fechaFin } = solicitud.datosPropuestos;
            const [equipo, jugador] = await Promise.all([
              equipoId ? Equipo.findById(equipoId).select('administradores creadoPor').session(session) : null,
              jugadorId ? Jugador.findById(jugadorId).select('administradores creadoPor').session(session) : null,
            ]);
            const toIds = (owner, adminsArr) => [owner, ...(adminsArr || [])].filter(Boolean).map(x => x?.toString?.() || x);
            const adminsEquipo = equipo ? toIds(equipo.creadoPor, equipo.administradores) : [];
            const adminsJugador = jugador ? toIds(jugador.creadoPor, jugador.administradores) : [];
            const creador = solicitud.creadoPor?.toString();
            const creadorEsEquipo = adminsEquipo.includes(creador);
            const creadorEsJugador = adminsJugador.includes(creador);
            const origen = creadorEsEquipo ? 'equipo' : (creadorEsJugador ? 'jugador' : 'equipo');

            const nuevaRelacion = new JugadorEquipo({
              jugador: jugadorId,
              equipo: equipoId,
              rol: rol || 'jugador',
              numeroCamiseta,
              desde: fechaInicio,
              hasta: fechaFin,
              estado: 'aceptado',
              origen,
              creadoPor: solicitud.creadoPor
            });
            await nuevaRelacion.save({ session });
          } else if (solicitud.tipo === 'jugador-equipo-eliminar') {
            const { contratoId } = solicitud.datosPropuestos;
            if (!contratoId) {
              throw new Error('contratoId requerido para eliminación');
            }

            const relacion = await JugadorEquipo.findById(contratoId).session(session);
            if (!relacion) throw new Error('Relación JugadorEquipo no encontrada');
            relacion.estado = 'baja';
            relacion.hasta = new Date();
            await relacion.save({ session });
          } else if (solicitud.tipo === 'jugador-equipo-editar' && solicitud.entidad) {
            let relacion = await JugadorEquipo.findById(solicitud.entidad).session(session);
            if (!relacion && solicitud.datosPropuestos?.contratoId) {
              relacion = await JugadorEquipo.findById(solicitud.datosPropuestos.contratoId).session(session);
            }
            if (relacion) {
              const cambios = solicitud.datosPropuestos || {};
              if (cambios.rol !== undefined) relacion.rol = cambios.rol;
              if (cambios.foto !== undefined) relacion.foto = cambios.foto;

              const desde = cambios.fechaInicio !== undefined ? cambios.fechaInicio : (cambios.desde !== undefined ? cambios.desde : undefined);
              const hasta = cambios.fechaFin !== undefined ? cambios.fechaFin : (cambios.hasta !== undefined ? cambios.hasta : undefined);
              if (desde !== undefined) relacion.desde = desde;
              if (hasta !== undefined) relacion.hasta = hasta;

              if (cambios.estado !== undefined) {
                relacion.estado = cambios.estado;
                if (cambios.estado === 'baja' && !relacion.hasta) relacion.hasta = new Date();
              }

              await relacion.save({ session });
            } else {
              // No existe relacion: no hacemos rollback, sólo log
              console.log('Relación no encontrada para aplicar cambios (editar)');
            }
          } else if (solicitud.tipo === 'participacion-temporada-crear') {
            const { equipoId, temporadaId, estado, observaciones } = solicitud.datosPropuestos || {};
            if (!equipoId || !temporadaId) throw new Error('equipoId y temporadaId requeridos');
            const existe = await ParticipacionTemporada.findOne({ equipo: equipoId, temporada: temporadaId }).session(session);
            if (existe) throw new Error('Ya existe una participación para este equipo y temporada');
            const nuevaPT = new ParticipacionTemporada({
              equipo: equipoId,
              temporada: temporadaId,
              estado: estado || 'activo',
              observaciones: observaciones || '',
              creadoPor: solicitud.creadoPor,
            });
            await nuevaPT.save({ session });
          } else if (solicitud.tipo === 'jugador-temporada-crear') {
            const { jugadorEquipoId, participacionTemporadaId, estado, rol, numeroCamiseta } = solicitud.datosPropuestos || {};
            if (!jugadorEquipoId || !participacionTemporadaId) throw new Error('jugadorEquipoId y participacionTemporadaId requeridos');
            const je = await JugadorEquipo.findById(jugadorEquipoId).select('jugador').session(session);
            if (!je) throw new Error('jugadorEquipo no encontrado');
            const existe = await JugadorTemporada.findOne({ jugadorEquipo: jugadorEquipoId, participacionTemporada: participacionTemporadaId }).session(session);
            if (existe) throw new Error('Ya existe un vínculo jugador-temporada para esos IDs');
            const nuevoJT = new JugadorTemporada({
              jugadorEquipo: jugadorEquipoId,
              participacionTemporada: participacionTemporadaId,
              // 'activo' no existe en el enum de JugadorTemporada (aceptado|baja|suspendido):
              // si la solicitud venía sin estado, aprobarla tiraba ValidationError.
              estado: estado || 'aceptado',
              rol: rol || 'jugador',
              numeroCamiseta,
              jugador: je.jugador,
              creadoPor: solicitud.creadoPor,
            });
            await nuevoJT.save({ session });
          } else if (solicitud.tipo === 'usuario-crear-equipo') {
            const nuevoEquipo = new Equipo({
              ...solicitud.datosPropuestos,
              creadoPor: solicitud.creadoPor,
              administradores: [solicitud.creadoPor],
              // Pasó por aprobación de un Super Admin: queda verificado de entrada.
              verificado: true,
              verificadoPor: req.user.uid,
              verificadoEn: new Date(),
              activo: true
            });
            await nuevoEquipo.save({ session });
            solicitud.entidad = nuevoEquipo._id;
          } else if (solicitud.tipo === 'usuario-crear-jugador') {
            const nuevoJugador = new Jugador({
              ...solicitud.datosPropuestos,
              creadoPor: solicitud.creadoPor,
              administradores: [solicitud.creadoPor],
              activo: true
            });
            await nuevoJugador.save({ session });
            solicitud.entidad = nuevoJugador._id;
          } else if (solicitud.tipo === 'usuario-crear-organizacion') {
            const nuevaOrg = new Organizacion({
              ...solicitud.datosPropuestos,
              creadoPor: solicitud.creadoPor,
              administradores: [solicitud.creadoPor],
              activo: true
            });
            await nuevaOrg.save({ session });
            solicitud.entidad = nuevaOrg._id;
          } else if (solicitud.tipo === 'usuario-solicitar-admin-equipo') {
            const equipo = await Equipo.findById(solicitud.entidad).session(session);
            if (equipo) {
              const yaEsAdmin = equipo.administradores.some(id => id.toString() === solicitud.creadoPor.toString());
              if (!yaEsAdmin) {
                equipo.administradores.push(solicitud.creadoPor);
                await equipo.save({ session });
              }
            }
          } else if (solicitud.tipo === 'usuario-solicitar-admin-jugador') {
            const jugador = await Jugador.findById(solicitud.entidad).session(session);
            if (jugador) {
              const yaEsAdmin = jugador.administradores.some(id => id.toString() === solicitud.creadoPor.toString());
              if (!yaEsAdmin) {
                jugador.administradores.push(solicitud.creadoPor);
                await jugador.save({ session });
              }
            }
          } else if (solicitud.tipo === 'jugador-claim') {
            const jugador = await Jugador.findById(solicitud.entidad).session(session);
            if (jugador) {
              // Seguridad extra: Validar que no haya sido reclamado por otro en el interín
              if (jugador.perfilReclamado && jugador.userId?.toString() !== solicitud.creadoPor?.toString()) {
                throw new Error('Este perfil ya fue reclamado por otro usuario.');
              }

              // Seguridad extra: Validar que el usuario no tenga ya otro perfil vinculado
              const yaTienePerfil = await Jugador.findOne({ 
                userId: solicitud.creadoPor, 
                _id: { $ne: jugador._id } 
              }).session(session);

              if (yaTienePerfil) {
                throw new Error(`El usuario ya tiene vinculado el perfil de ${yaTienePerfil.nombre}. No se puede vincular un segundo perfil.`);
              }

              jugador.userId = solicitud.creadoPor;
              jugador.perfilReclamado = true;
              
              const yaEsAdmin = jugador.administradores.some(id => id.toString() === solicitud.creadoPor.toString());
              if (!yaEsAdmin) {
                jugador.administradores.push(solicitud.creadoPor);
              }
              await jugador.save({ session });
            }
          } else if (solicitud.tipo === 'usuario-solicitar-admin-organizacion') {
            const org = await Organizacion.findById(solicitud.entidad).session(session);
            if (org) {
              const yaEsAdmin = org.administradores.some(id => id.toString() === solicitud.creadoPor.toString());
              if (!yaEsAdmin) {
                org.administradores.push(solicitud.creadoPor);
                await org.save({ session });
              }
            }
          } else if (solicitud.tipo === 'participacion-temporada-eliminar') {
            const targetId = solicitud.datosPropuestos?.participacionTemporadaId || solicitud.entidad;
            if (targetId) {
              const pt = await ParticipacionTemporada.findById(targetId).session(session);
              if (pt) {
                pt.estado = 'baja';
                await pt.save({ session });
              }
            }
          } else if (solicitud.tipo === 'jugador-temporada-eliminar') {
            const targetId = solicitud.datosPropuestos?.jugadorTemporadaId || solicitud.entidad;
            if (targetId) {
              const jt = await JugadorTemporada.findById(targetId).session(session);
              if (jt) {
                jt.estado = 'baja';
                await jt.save({ session });
              }
            }
          } else {
            // Para otras acciones que modifican entidades (usuarios, equipos, orgs, etc.)
            // mantenerse con la misma lógica pero usar .save({ session }) donde aplique.
          }
        });
      } catch (e) {
        console.error('Error durante transacción al aplicar cambios de solicitud:', e);
        // Intentamos marcar la solicitud como error si no se guardó correctamente
        try { await solicitud.save(); } catch (ee) { console.error('Error guardando solicitud tras fallo transacción:', ee); }
        return res.status(500).json({ message: 'Error al aplicar los cambios de la solicitud', error: e.message });
      } finally {
        session.endSession();
      }

      // Fuera de la transacción, ya con las filas visibles.
      for (const jugadorPartidoId of jugadorPartidosARecalcular) {
        await recalcularAgregadosDeJugadorPartido(jugadorPartidoId, uid);
      }

      for (const partidoId of partidosARecargarEnTimer) {
        try {
          await TimerManager.reloadMatch(partidoId);
        } catch (e) {
          console.error('No se pudo refrescar el timer del partido', partidoId, e);
        }
      }
    }

    console.log('Guardando solicitud con estado final:', solicitud.estado);
    await solicitud.save();

    console.log('Solicitud guardada exitosamente, enviando respuesta');
    res.status(200).json(solicitud);

  } catch (error) {
    console.error('Error al actualizar solicitud:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ message: 'Error al actualizar solicitud', error: error.message });
  }
});

/**
 * @swagger
 * /api/solicitudes-edicion/{id}:
 *   delete:
 *     summary: Elimina una solicitud de edición (cancelar)
 *     tags: [Solicitudes de Edición]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la solicitud a eliminar
 *     responses:
 *       200:
 *         description: Solicitud cancelada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Solicitud cancelada correctamente
 *       403:
 *         description: No autorizado para eliminar esta solicitud o la solicitud no está en estado pendiente
 *       404:
 *         description: Solicitud no encontrada
 *       500:
 *         description: Error al eliminar la solicitud
 */
/**
 * @swagger
 * /api/solicitudes-edicion/{id}:
 *   delete:
 *     summary: Elimina una solicitud pendiente
 *     description: Permite al creador eliminar una solicitud que aún esté pendiente
 *     tags: [SolicitudesEdicion]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la solicitud
 *     responses:
 *       200:
 *         description: Solicitud eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Solicitud eliminada exitosamente
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: No se puede eliminar la solicitud (ya fue procesada o no es el creador)
 *       404:
 *         description: Solicitud no encontrada
 *       500:
 *         description: Error al eliminar solicitud
 */
router.delete('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const solicitud = await SolicitudEdicion.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(403).json({ message: 'No se puede eliminar esta solicitud' });
    const uid = req.user.uid;

    let permitido = solicitud.creadoPor.toString() === uid;

    // Permitir también a administradores del lado emisor cancelar
    if (!permitido && solicitud.tipo === 'jugador-equipo-crear') {
      const equipoId = solicitud.datosPropuestos?.equipoId;
      const jugadorId = solicitud.datosPropuestos?.jugadorId;

      const [equipo, jugador] = await Promise.all([
        equipoId ? Equipo.findById(equipoId).select('administradores creadoPor') : null,
        jugadorId ? Jugador.findById(jugadorId).select('administradores creadoPor') : null,
      ]);

      const toIds = (owner, adminsArr) => [owner, ...(adminsArr || [])]
        .filter(Boolean)
        .map(x => x?.toString?.() || x);

      const adminsEquipo = equipo ? toIds(equipo.creadoPor, equipo.administradores) : [];
      const adminsJugador = jugador ? toIds(jugador.creadoPor, jugador.administradores) : [];

      const creador = solicitud.creadoPor?.toString();
      const creadorEsEquipo = adminsEquipo.includes(creador);
      const creadorEsJugador = adminsJugador.includes(creador);

      const esAdminEquipo = adminsEquipo.includes(uid);
      const esAdminJugador = adminsJugador.includes(uid);

      if ((creadorEsEquipo && esAdminEquipo) || (creadorEsJugador && esAdminJugador)) {
        permitido = true;
      }
    }

    // Permitir siempre a admin global
    if (req.user.rol === 'admin') permitido = true;

    if (!permitido) return res.status(403).json({ message: 'No autorizado' });

    await solicitud.deleteOne();
    res.status(200).json({ message: 'Solicitud cancelada correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar solicitud', error: error.message });
  }
});

export default router;
