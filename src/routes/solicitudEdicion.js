import express from 'express';
import mongoose from 'mongoose';
import SolicitudEdicion from '../models/SolicitudEdicion.js';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../middleware/validacionObjectId.js';
import validarDobleConfirmacion from '../utils/validarDobleConfirmacion.js';
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
 *                 contratoEquipoCompetencia, jugador-equipo-crear, jugador-equipo-eliminar,
 *                 participacion-temporada-crear, participacion-temporada-actualizar, participacion-temporada-eliminar,
 *                 jugador-temporada-crear, jugador-temporada-actualizar, jugador-temporada-eliminar,
 *                 usuario-crear-jugador, usuario-crear-equipo, usuario-crear-organizacion,
 *                 usuario-solicitar-admin-jugador, usuario-solicitar-admin-equipo, usuario-solicitar-admin-organizacion]
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
 *                 contratoEquipoCompetencia, jugador-equipo-crear, jugador-equipo-eliminar, participacion-temporada-crear, 
 *                 participacion-temporada-actualizar, participacion-temporada-eliminar, jugador-temporada-crear, 
 *                 jugador-temporada-actualizar, jugador-temporada-eliminar, usuario-crear-jugador, usuario-crear-equipo, 
 *                 usuario-crear-organizacion, usuario-solicitar-admin-jugador, usuario-solicitar-admin-equipo, usuario-solicitar-admin-organizacion]
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
 *     responses:
 *       200:
 *         description: Lista de solicitudes de edición
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SolicitudEdicion'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error al obtener las solicitudes
 */
router.get('/', verificarToken, async (req, res) => {
  try {
    const { tipo, estado, creadoPor, entidad } = req.query;
    const filtro = {
      ...(tipo ? { tipo } : {}),
      ...(estado ? { estado } : {}),
      ...(creadoPor ? { creadoPor } : {}),
      ...(entidad ? { entidad } : {}),
    };

    const solicitudes = await SolicitudEdicion.find(filtro).sort({ createdAt: -1 }).lean();
    res.status(200).json(solicitudes);
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
        'participacion-temporada-crear', 'participacion-temporada-actualizar', 'participacion-temporada-eliminar',
        'jugador-temporada-crear', 'jugador-temporada-actualizar', 'jugador-temporada-eliminar',
        'usuario-solicitar-admin-equipo',
      ],
      organizacion: [
        'usuario-solicitar-admin-organizacion',
      ],
      competencia: [
        'participacion-temporada-crear', 'participacion-temporada-actualizar', 'participacion-temporada-eliminar',
        'jugador-temporada-crear', 'jugador-temporada-actualizar', 'jugador-temporada-eliminar',
      ],
      temporada: [
        'participacion-temporada-crear', 'participacion-temporada-actualizar', 'participacion-temporada-eliminar',
        'jugador-temporada-crear', 'jugador-temporada-actualizar', 'jugador-temporada-eliminar',
      ],
      fase: [
        'resultadoPartido', 'resultadoSet', 'estadisticasJugadorPartido', 'estadisticasJugadorSet', 'estadisticasEquipoPartido', 'estadisticasEquipoSet'
      ],
      partido: [
        'resultadoPartido', 'resultadoSet', 'estadisticasJugadorPartido', 'estadisticasJugadorSet', 'estadisticasEquipoPartido', 'estadisticasEquipoSet'
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
 *                       contratoEquipoCompetencia, jugador-equipo-crear, jugador-equipo-eliminar, participacion-temporada-crear, 
 *                       participacion-temporada-actualizar, participacion-temporada-eliminar, jugador-temporada-crear, 
 *                       jugador-temporada-actualizar, jugador-temporada-eliminar, usuario-crear-jugador, usuario-crear-equipo, 
 *                       usuario-crear-organizacion, usuario-solicitar-admin-jugador, usuario-solicitar-admin-equipo, usuario-solicitar-admin-organizacion]
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
router.put('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const { estado, motivoRechazo, datosPropuestos } = req.body;
    const uid = req.user.uid;

    const solicitud = await SolicitudEdicion.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(400).json({ message: 'Solicitud ya procesada' });

    // Obtener admins responsables (de tu función existente)
    let admins = [];
    if (solicitud.entidad) {
      // Si hay entidad, determinar admins según tipo, con soportes adicionales
      if (solicitud.tipo.startsWith('participacion-temporada')) {
        const pt = await ParticipacionTemporada.findById(solicitud.entidad)
          .populate('equipo', 'administradores creadoPor')
          .populate('temporada', 'competencia');
        if (!pt) return res.status(404).json({ message: 'ParticipacionTemporada no encontrada' });
        const comp = await Competencia.findById(pt.temporada?.competencia).select('administradores creadoPor');
        const toIds = (owner, adminsArr) => [owner, ...(adminsArr || [])].filter(Boolean).map(x => x?.toString?.() || x);
        admins = [...new Set([
          ...toIds(pt.equipo?.creadoPor, pt.equipo?.administradores),
          ...toIds(comp?.creadoPor, comp?.administradores)
        ])];
      } else if (solicitud.tipo.startsWith('jugador-temporada')) {
        const jt = await JugadorTemporada.findById(solicitud.entidad);
        if (!jt) return res.status(404).json({ message: 'JugadorTemporada no encontrada' });
        const pt = await ParticipacionTemporada.findById(jt.participacionTemporada)
          .populate('equipo', 'administradores creadoPor')
          .populate('temporada', 'competencia');
        const comp = await Competencia.findById(pt.temporada?.competencia).select('administradores creadoPor');
        const toIds = (owner, adminsArr) => [owner, ...(adminsArr || [])].filter(Boolean).map(x => x?.toString?.() || x);
        admins = [...new Set([
          ...toIds(pt.equipo?.creadoPor, pt.equipo?.administradores),
          ...toIds(comp?.creadoPor, comp?.administradores)
        ])];
      } else if (solicitud.tipo === 'usuario-solicitar-admin-jugador') {
        const entity = await Jugador.findById(solicitud.entidad).select('administradores creadoPor');
        if (!entity) return res.status(404).json({ message: 'Jugador no encontrado' });
        const ids = new Set([entity.creadoPor?.toString(), ...(entity.administradores || []).map(x => x?.toString?.())]);
        admins = Array.from(ids).filter(Boolean);
      } else if (solicitud.tipo === 'usuario-solicitar-admin-equipo') {
        const entity = await Equipo.findById(solicitud.entidad).select('administradores creadoPor');
        if (!entity) return res.status(404).json({ message: 'Equipo no encontrado' });
        const ids = new Set([entity.creadoPor?.toString(), ...(entity.administradores || []).map(x => x?.toString?.())]);
        admins = Array.from(ids).filter(Boolean);
      } else if (solicitud.tipo === 'usuario-solicitar-admin-organizacion') {
        const entity = await Organizacion.findById(solicitud.entidad).select('administradores creadoPor');
        if (!entity) return res.status(404).json({ message: 'Organización no encontrada' });
        const ids = new Set([entity.creadoPor?.toString(), ...(entity.administradores || []).map(x => x?.toString?.())]);
        admins = Array.from(ids).filter(Boolean);
      } else {
        // Fallback: usar servicio existente
        admins = await obtenerAdminsParaSolicitud(solicitud.tipo, solicitud.entidad);
      }
    } else {
      // Para solicitudes donde entidad es null
      if (solicitud.tipo === 'jugador-equipo-crear') {
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

        // Si la solicitud la creó un admin del equipo, entonces debe aprobar un admin del jugador.
        // Si la creó un admin del jugador, debe aprobar un admin del equipo.
        if (creadorEsEquipo) {
          admins = adminsJugador;
        } else if (creadorEsJugador) {
          admins = adminsEquipo;
        } else {
          // Fallback: admins del equipo
          admins = adminsEquipo;
        }
      } else if (solicitud.tipo === 'jugador-equipo-eliminar') {
        const contratoId = solicitud.datosPropuestos.contratoId;
        if (contratoId) {
          const contrato = await JugadorEquipo.findById(contratoId)
            .populate('equipo', 'administradores creadoPor')
            .populate('jugador', 'administradores creadoPor');
          if (contrato) {
            const ids = new Set();
            if (contrato.equipo?.creadoPor) ids.add(contrato.equipo.creadoPor.toString());
            if (Array.isArray(contrato.equipo?.administradores)) {
              contrato.equipo.administradores.forEach(a => ids.add(a.toString()));
            }
            if (contrato.jugador?.creadoPor) ids.add(contrato.jugador.creadoPor.toString());
            if (Array.isArray(contrato.jugador?.administradores)) {
              contrato.jugador.administradores.forEach(a => ids.add(a.toString()));
            }
            admins = Array.from(ids);
          }
        }
      } else if (solicitud.tipo === 'participacion-temporada-crear') {
        const equipoId = solicitud.datosPropuestos?.equipoId;
        const temporadaId = solicitud.datosPropuestos?.temporadaId;
        const [equipo, temporada] = await Promise.all([
          equipoId ? Equipo.findById(equipoId).select('administradores creadoPor') : null,
          temporadaId ? Temporada.findById(temporadaId).select('competencia') : null,
        ]);
        if (!equipo || !temporada) {
          admins = [];
        } else {
          const comp = await Competencia.findById(temporada.competencia).select('administradores creadoPor');
          const toIds = (owner, adminsArr) => [owner, ...(adminsArr || [])].filter(Boolean).map(x => x?.toString?.() || x);
          const adminsEquipo = toIds(equipo.creadoPor, equipo.administradores);
          const adminsCompetencia = toIds(comp?.creadoPor, comp?.administradores || []);
          const creador = solicitud.creadoPor?.toString();
          const creadorEsEquipo = adminsEquipo.includes(creador);
          const creadorEsCompetencia = adminsCompetencia.includes(creador);
          admins = creadorEsEquipo ? adminsCompetencia : creadorEsCompetencia ? adminsEquipo : adminsCompetencia;
        }
      } else if (solicitud.tipo === 'jugador-temporada-crear') {
        const ptId = solicitud.datosPropuestos?.participacionTemporadaId;
        const jeId = solicitud.datosPropuestos?.jugadorEquipoId;
        const [pt, je] = await Promise.all([
          ptId ? ParticipacionTemporada.findById(ptId).populate('equipo', 'administradores creadoPor') : null,
          jeId ? JugadorEquipo.findById(jeId).populate('jugador', 'creadoPor administradores').populate('equipo', 'creadoPor administradores') : null,
        ]);
        if (!pt || !je) {
          admins = [];
        } else {
          const temp = await Temporada.findById(pt.temporada).select('competencia');
          const comp = temp ? await Competencia.findById(temp.competencia).select('administradores creadoPor') : null;
          const toIds = (owner, adminsArr) => [owner, ...(adminsArr || [])].filter(Boolean).map(x => x?.toString?.() || x);
          const adminsEquipo = toIds(pt.equipo?.creadoPor, pt.equipo?.administradores);
          const adminsCompetencia = toIds(comp?.creadoPor, comp?.administradores || []);
          const creador = solicitud.creadoPor?.toString();
          const creadorEsEquipo = adminsEquipo.includes(creador);
          const creadorEsCompetencia = adminsCompetencia.includes(creador);
          admins = creadorEsEquipo ? adminsCompetencia : creadorEsCompetencia ? adminsEquipo : adminsCompetencia;
        }
      } else if (solicitud.tipo.startsWith('usuario-crear-')) {
        // Requiere admin del sistema
        if (req.user.rol !== 'admin') {
          return res.status(403).json({ message: 'Solo admin puede gestionar estas solicitudes' });
        }
        admins = [uid];
      }
    }

    // Autorización: sólo aprobadores (o admin global) pueden gestionar la solicitud
    if (!admins.map(id => id?.toString?.() || id).includes(uid) && req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No autorizado para gestionar esta solicitud' });
    }

    if (estado === 'aceptado') {
      // Validar si la edición requiere doble confirmación
      const camposModificados = Object.keys(datosPropuestos || {});
      const { requiereDobleConfirmacion, camposCriticosModificados } = validarDobleConfirmacion(solicitud.tipo, camposModificados);

      if (requiereDobleConfirmacion) {
        // Si se requiere doble confirmación, se debe agregar el uid a aceptadoPor y no marcar como 'aceptado' aún
        if (!solicitud.aceptadoPor.includes(uid)) {
          solicitud.aceptadoPor.push(uid);
        }

        // Si ya todos los aprobadores aceptaron, cambiar estado a aceptado final
        const meta = tiposSolicitudMeta[solicitud.tipo];
        const aprobadoresNecesarios = meta.rolesAprobadores.length; // esto podés mejorar para contar admins actuales
        if (solicitud.aceptadoPor.length >= aprobadoresNecesarios) {
          solicitud.estado = 'aceptado';
          solicitud.fechaAceptacion = new Date();
          solicitud.aprobadoPor = uid; // último que aprobó
        } else {
          // Todavía pendiente que otro admin apruebe
          solicitud.estado = 'pendiente';
        }
      } else {
        // No requiere doble confirmación, aceptar directo
        solicitud.estado = 'aceptado';
        solicitud.fechaAceptacion = new Date();
        solicitud.aprobadoPor = uid;
      }

      // Actualizar datosPropuestos si vienen
      if (datosPropuestos) {
        solicitud.datosPropuestos = datosPropuestos;
      }

      // Aplicar cambios a la entidad si corresponde
      if (solicitud.tipo === 'jugador-equipo-crear') {
        try {
          const { jugadorId, equipoId, rol, numeroCamiseta, fechaInicio, fechaFin } = solicitud.datosPropuestos;
          const [equipo, jugador] = await Promise.all([
            equipoId ? Equipo.findById(equipoId).select('administradores creadoPor') : null,
            jugadorId ? Jugador.findById(jugadorId).select('administradores creadoPor') : null,
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
          await nuevaRelacion.save();
        } catch (e) {
          console.error('Error creando nueva relación JugadorEquipo:', e);
          return res.status(500).json({ message: 'Error al crear la relación', error: e.message });
        }
      } else if (solicitud.tipo === 'jugador-equipo-eliminar') {
        try {
          const { contratoId } = solicitud.datosPropuestos;
          const relacion = await JugadorEquipo.findById(contratoId);
          if (relacion) {
            // Marcar como baja en lugar de eliminar físicamente para mantener historial
            relacion.estado = 'baja';
            relacion.hasta = new Date();
            await relacion.save();
          }
        } catch (e) {
          console.error('Error eliminando relación JugadorEquipo:', e);
          return res.status(500).json({ message: 'Error al eliminar la relación', error: e.message });
        }
      } else if (solicitud.tipo === 'jugador-equipo-editar' && solicitud.entidad) {
        try {
          const relacion = await JugadorEquipo.findById(solicitud.entidad);
          if (relacion) {
            const cambios = solicitud.datosPropuestos || {};
            if (cambios.rol !== undefined) relacion.rol = cambios.rol;
            if (cambios.foto !== undefined) relacion.foto = cambios.foto;

            // Soportar tanto 'desde/hasta' como 'fechaInicio/fechaFin' en payload
            const desde = cambios.desde !== undefined ? cambios.desde : cambios.fechaInicio;
            const hasta = cambios.hasta !== undefined ? cambios.hasta : cambios.fechaFin;
            if (desde !== undefined) relacion.desde = desde;
            if (hasta !== undefined) relacion.hasta = hasta;

            // Permitir finalizar contrato aceptado → baja
            if (cambios.estado === 'baja' && relacion.estado === 'aceptado') {
              relacion.estado = 'baja';
              relacion.activo = false;
              if (!relacion.hasta) relacion.hasta = new Date();
            }

            await relacion.save();
          }
        } catch (e) {
          // No fallar la aceptación por error al aplicar, pero informar
          console.error('Error aplicando cambios de solicitud a JugadorEquipo:', e);
        }
      } else if (solicitud.tipo === 'participacion-temporada-crear') {
        try {
          const { equipoId, temporadaId, estado, observaciones } = solicitud.datosPropuestos || {};
          if (!equipoId || !temporadaId) {
            return res.status(400).json({ message: 'equipoId y temporadaId requeridos' });
          }
          const existe = await ParticipacionTemporada.findOne({ equipo: equipoId, temporada: temporadaId });
          if (existe) return res.status(409).json({ message: 'Ya existe una participación para este equipo y temporada' });

          const nuevaPT = new ParticipacionTemporada({
            equipo: equipoId,
            temporada: temporadaId,
            estado: estado || 'activo',
            observaciones: observaciones || '',
            creadoPor: solicitud.creadoPor,
          });
          await nuevaPT.save();
        } catch (e) {
          console.error('Error creando ParticipacionTemporada desde solicitud:', e);
          return res.status(500).json({ message: 'Error al crear participación', error: e.message });
        }
      } else if (solicitud.tipo === 'jugador-temporada-crear') {
        try {
          const { jugadorEquipoId, participacionTemporadaId, estado, rol } = solicitud.datosPropuestos || {};
          if (!jugadorEquipoId || !participacionTemporadaId) {
            return res.status(400).json({ message: 'jugadorEquipoId y participacionTemporadaId requeridos' });
          }
          const je = await JugadorEquipo.findById(jugadorEquipoId).select('jugador');
          if (!je) return res.status(400).json({ message: 'jugadorEquipo no encontrado' });

          const existe = await JugadorTemporada.findOne({ jugadorEquipo: jugadorEquipoId, participacionTemporada: participacionTemporadaId });
          if (existe) return res.status(409).json({ message: 'Ya existe un vínculo jugador-temporada para esos IDs' });

          const nuevoJT = new JugadorTemporada({
            jugadorEquipo: jugadorEquipoId,
            participacionTemporada: participacionTemporadaId,
            estado: estado || 'activo',
            rol: rol || 'jugador',
            jugador: je.jugador,
            creadoPor: solicitud.creadoPor,
          });
          await nuevoJT.save();
        } catch (e) {
          console.error('Error creando JugadorTemporada desde solicitud:', e);
          return res.status(500).json({ message: 'Error al crear jugador-temporada', error: e.message });
        }
      } else if (solicitud.tipo === 'participacion-temporada-actualizar') {
        try {
          const { participacionTemporadaId, estado, observaciones } = solicitud.datosPropuestos || {};
          const pt = await ParticipacionTemporada.findById(participacionTemporadaId);
          if (!pt) return res.status(404).json({ message: 'ParticipacionTemporada no encontrada' });
          if (estado !== undefined) pt.estado = estado;
          if (observaciones !== undefined) pt.observaciones = observaciones;
          await pt.save();
        } catch (e) {
          console.error('Error actualizando ParticipacionTemporada:', e);
          return res.status(500).json({ message: 'Error al actualizar participación', error: e.message });
        }
      } else if (solicitud.tipo === 'participacion-temporada-eliminar') {
        try {
          const { participacionTemporadaId } = solicitud.datosPropuestos || {};
          const pt = await ParticipacionTemporada.findById(participacionTemporadaId);
          if (!pt) return res.status(404).json({ message: 'ParticipacionTemporada no encontrada' });
          await pt.deleteOne();
        } catch (e) {
          console.error('Error eliminando ParticipacionTemporada:', e);
          return res.status(500).json({ message: 'Error al eliminar participación', error: e.message });
        }
      } else if (solicitud.tipo === 'jugador-temporada-actualizar') {
        try {
          const { jugadorTemporadaId, estado, rol } = solicitud.datosPropuestos || {};
          const jt = await JugadorTemporada.findById(jugadorTemporadaId);
          if (!jt) return res.status(404).json({ message: 'JugadorTemporada no encontrada' });
          if (estado !== undefined) jt.estado = estado;
          if (rol !== undefined) jt.rol = rol;
          await jt.save();
        } catch (e) {
          console.error('Error actualizando JugadorTemporada:', e);
          return res.status(500).json({ message: 'Error al actualizar jugador-temporada', error: e.message });
        }
      } else if (solicitud.tipo === 'jugador-temporada-eliminar') {
        try {
          const { jugadorTemporadaId } = solicitud.datosPropuestos || {};
          const jt = await JugadorTemporada.findById(jugadorTemporadaId);
          if (!jt) return res.status(404).json({ message: 'JugadorTemporada no encontrada' });
          await jt.deleteOne();
        } catch (e) {
          console.error('Error eliminando JugadorTemporada:', e);
          return res.status(500).json({ message: 'Error al eliminar jugador-temporada', error: e.message });
        }
      } else if (solicitud.tipo === 'usuario-crear-jugador') {
        try {
          const { nombre, alias, fechaNacimiento, genero, foto, nacionalidad } = solicitud.datosPropuestos || {};
          if (!nombre || !fechaNacimiento) return res.status(400).json({ message: 'nombre y fechaNacimiento requeridos' });
          const nuevo = new Jugador({ nombre, alias, fechaNacimiento, genero, foto, nacionalidad, creadoPor: solicitud.creadoPor });
          await nuevo.save();
        } catch (e) {
          console.error('Error creando Jugador desde solicitud:', e);
          return res.status(500).json({ message: 'Error al crear jugador', error: e.message });
        }
      } else if (solicitud.tipo === 'usuario-crear-equipo') {
        try {
          const { nombre, escudo, foto, colores, tipo, pais, descripcion, sitioWeb } = solicitud.datosPropuestos || {};
          if (!nombre) return res.status(400).json({ message: 'nombre requerido' });
          const nuevo = new Equipo({ nombre, escudo, foto, colores, tipo, pais, descripcion, sitioWeb, creadoPor: solicitud.creadoPor });
          await nuevo.save();
        } catch (e) {
          console.error('Error creando Equipo desde solicitud:', e);
          return res.status(500).json({ message: 'Error al crear equipo', error: e.message });
        }
      } else if (solicitud.tipo === 'usuario-crear-organizacion') {
        try {
          const { nombre, descripcion, logo, sitioWeb } = solicitud.datosPropuestos || {};
          if (!nombre) return res.status(400).json({ message: 'nombre requerido' });
          const nuevo = new Organizacion({ nombre, descripcion, logo, sitioWeb, creadoPor: solicitud.creadoPor });
          await nuevo.save();
        } catch (e) {
          console.error('Error creando Organización desde solicitud:', e);
          return res.status(500).json({ message: 'Error al crear organización', error: e.message });
        }
      } else if (solicitud.tipo === 'usuario-solicitar-admin-jugador') {
        try {
          const jugador = await Jugador.findById(solicitud.entidad || solicitud.datosPropuestos?.jugadorId);
          if (!jugador) return res.status(404).json({ message: 'Jugador no encontrado' });
          const uidSolicitante = solicitud.creadoPor?.toString();
          if (!jugador.administradores.includes(uidSolicitante)) {
            jugador.administradores.push(uidSolicitante);
            await jugador.save();
          }
        } catch (e) {
          console.error('Error asignando admin a Jugador:', e);
          return res.status(500).json({ message: 'Error al asignar admin a jugador', error: e.message });
        }
      } else if (solicitud.tipo === 'usuario-solicitar-admin-equipo') {
        try {
          const equipo = await Equipo.findById(solicitud.entidad || solicitud.datosPropuestos?.equipoId);
          if (!equipo) return res.status(404).json({ message: 'Equipo no encontrado' });
          const uidSolicitante = solicitud.creadoPor?.toString();
          if (!equipo.administradores.includes(uidSolicitante)) {
            equipo.administradores.push(uidSolicitante);
            await equipo.save();
          }
        } catch (e) {
          console.error('Error asignando admin a Equipo:', e);
          return res.status(500).json({ message: 'Error al asignar admin a equipo', error: e.message });
        }
      } else if (solicitud.tipo === 'usuario-solicitar-admin-organizacion') {
        try {
          const org = await Organizacion.findById(solicitud.entidad || solicitud.datosPropuestos?.organizacionId);
          if (!org) return res.status(404).json({ message: 'Organización no encontrada' });
          const uidSolicitante = solicitud.creadoPor?.toString();
          if (!org.administradores.includes(uidSolicitante)) {
            org.administradores.push(uidSolicitante);
            await org.save();
          }
        } catch (e) {
          console.error('Error asignando admin a Organización:', e);
          return res.status(500).json({ message: 'Error al asignar admin a organización', error: e.message });
        }
      }
    }
    await solicitud.save();
    res.status(200).json(solicitud);

  } catch (error) {
    console.error('Error al actualizar solicitud:', error);
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
router.delete('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const solicitud = await SolicitudEdicion.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(403).json({ message: 'No se puede eliminar esta solicitud' });
    const uid = req.user.uid;

    let permitido = solicitud.creadoPor === uid;

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
