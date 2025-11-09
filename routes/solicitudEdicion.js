import express from 'express';
import mongoose from 'mongoose';
import SolicitudEdicion from '../models/SolicitudEdicion.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import validarDobleConfirmacion from '../utils/validarDobleConfirmacion.js';
import { tiposSolicitudMeta } from '../config/solicitudesMeta.js';
import { obtenerAdminsParaSolicitud } from '../services/obtenerAdminsParaSolicitud.js';
import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';
import Jugador from '../models/Jugador/Jugador.js';
import EquipoCompetencia from '../models/Equipo/EquipoCompetencia.js';
import Equipo from '../models/Equipo/Equipo.js';

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
 *                 estadisticasEquipoPartido, estadisticasEquipoSet, contratoJugadorEquipo, 
 *                 contratoEquipoCompetencia, jugador-equipo-crear, jugador-equipo-eliminar]
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
 *                 estadisticasEquipoSet, contratoJugadorEquipo, 
 *                 contratoEquipoCompetencia, jugador-equipo-crear, 
 *                 jugador-equipo-eliminar]
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
 *                       estadisticasEquipoSet, contratoJugadorEquipo, 
 *                       contratoEquipoCompetencia, jugador-equipo-crear, 
 *                       jugador-equipo-eliminar]
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

    const tiposPermitidos = [
      'resultadoPartido', 'resultadoSet', 'estadisticasJugadorPartido', 'estadisticasJugadorSet',
      'estadisticasEquipoPartido', 'estadisticasEquipoSet', 'contratoJugadorEquipo',
      'contratoEquipoCompetencia', 'jugador-equipo-crear', 'jugador-equipo-eliminar'
    ];

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
      // Si hay entidad, usar la lógica normal
      admins = await obtenerAdminsParaSolicitud(solicitud.tipo, solicitud.entidad);
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
          const nuevaRelacion = new JugadorEquipo({
            jugador: jugadorId,
            equipo: equipoId,
            rol: rol || 'jugador',
            numeroCamiseta,
            desde: fechaInicio,
            hasta: fechaFin,
            estado: 'aceptado',
            origen: 'solicitud',
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
      } else if (solicitud.tipo === 'contratoJugadorEquipo' && solicitud.entidad) {
        try {
          const relacion = await JugadorEquipo.findById(solicitud.entidad);
          if (relacion) {
            const cambios = solicitud.datosPropuestos || {};
            if (cambios.rol !== undefined) relacion.rol = cambios.rol;
            if (cambios.foto !== undefined) relacion.foto = cambios.foto;
            if (cambios.desde !== undefined) relacion.desde = cambios.desde;
            if (cambios.hasta !== undefined) relacion.hasta = cambios.hasta;

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
      }
    } else if (estado === 'rechazado') {
      solicitud.estado = 'rechazado';
      solicitud.motivoRechazo = motivoRechazo || '';
      solicitud.aprobadoPor = uid;
      solicitud.fechaRechazo = new Date();
    } else {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    await solicitud.save();
    res.status(200).json(solicitud);

  } catch (error) {
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
