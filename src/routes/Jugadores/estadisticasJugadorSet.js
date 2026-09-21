import express from 'express';
import mongoose from 'mongoose';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import EstadisticasJugadorSet from '../../models/Jugador/EstadisticasJugadorSet.js';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';
import { actualizarEstadisticasJugadorPartido, actualizarEstadisticasEquipoPartido } from '../../utils/estadisticasAggregator.js';
import SetPartido from '../../models/Partido/SetPartido.js';
import { requireTeamPermission } from '../../middleware/requireTeamPermission.js';
import {
  hasTeamPermission,
  getEquipoIdFromEstadisticaJugadorSet,
  getEquipoIdFromJugadorPartido,
} from '../../services/teamPermissionService.js';
import {
  encolarSolicitudStatsLoteSet,
  normalizarVisibilidadObjetivo,
  resolverFiltroEstadoPublicacion,
} from '../../services/statsApprovalService.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: EstadisticasJugadorSet
 *   description: Gestión de estadísticas por jugador en cada set del partido
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     EstadisticasJugadorSet:
 *       type: object
 *       required:
 *         - set
 *         - jugadorPartido
 *         - jugador
 *         - equipo
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único de las estadísticas por set
 *         set:
 *           type: string
 *           format: ObjectId
 *           description: Referencia al set del partido
 *         jugadorPartido:
 *           type: string
 *           format: ObjectId
 *           description: Referencia a la relación Jugador-Partido
 *         jugador:
 *           type: string
 *           format: ObjectId
 *           description: Referencia al jugador
 *         equipo:
 *           type: string
 *           format: ObjectId
 *           description: Referencia al equipo
 *         throws:
 *           type: number
 *           default: 0
 *         hits:
 *           type: number
 *           default: 0
 *         outs:
 *           type: number
 *           default: 0
 *         catches:
 *           type: number
 *           default: 0
 *         survive:
 *           type: boolean
 *           default: false
 *         creadoPor:
 *           type: string
 *           description: ID del usuario que creó el registro
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/estadisticas/jugador-set:
 *   get:
 *     summary: Lista estadísticas por jugador para cada set
 *     description: Permite filtrar por set, jugadorPartido, jugador o equipo.
 *     tags: [EstadisticasJugadorSet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: set
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: jugadorPartido
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: jugador
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de estadísticas obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EstadisticasJugadorSet'
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { set, jugadorPartido, jugador, equipo, estadoPublicacion } = req.query;
      
      // Construir filtro dinámico
      const filtro = {};
      const visibilidad = resolverFiltroEstadoPublicacion(estadoPublicacion, req.user?.rol);
      if (!visibilidad.ok) {
        return res.status(visibilidad.status).json({ error: visibilidad.message });
      }
      filtro.estadoPublicacion = { $in: visibilidad.estados };
      if (set) filtro.set = set;
      if (jugadorPartido) filtro.jugadorPartido = jugadorPartido;
      if (jugador) filtro.jugador = jugador;
      if (equipo) filtro.equipo = equipo;

      const estadisticas = await EstadisticasJugadorSet.find(filtro)
        .populate({
          path: 'jugadorPartido',
          select: 'jugador equipo',
          populate: [
            { path: 'jugador', select: 'nombre apellido numero email' },
            { path: 'equipo', select: 'nombre escudo' }
          ]
        })
        .populate({
          path: 'set',
          select: 'numeroSet'
        })
        .lean()
        .sort({ createdAt: 1 });

      // Formatear respuesta para consistencia con otros endpoints
      const estadisticasFormateadas = estadisticas.map(stat => ({
        ...stat,
        jugador: stat.jugadorPartido?.jugador || null,
        equipo: stat.jugadorPartido?.equipo || null
      }));

      // Log opcional para debug
      // if (estadisticas.length > 0) {
      //   console.log('📊 Estadísticas devueltas:', estadisticas.length);
      // }

      res.json(estadisticasFormateadas);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Error al obtener estadísticas' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-set:
 *   post:
 *     summary: Crea estadísticas por jugador en un set
 *     tags: [EstadisticasJugadorSet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - set
 *               - jugadorPartido
 *               - jugador
 *               - equipo
 *             properties:
 *               set:
 *                 type: string
 *                 format: ObjectId
 *               jugadorPartido:
 *                 type: string
 *                 format: ObjectId
 *               jugador:
 *                 type: string
 *                 format: ObjectId
 *               equipo:
 *                 type: string
 *                 format: ObjectId
 *               throws:
 *                 type: number
 *               hits:
 *                 type: number
 *               outs:
 *                 type: number
 *               catches:
 *                 type: number
 *               survive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Estadísticas creadas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EstadisticasJugadorSet'
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  requireTeamPermission({
    permission: 'stats.capture',
    // El equipo se deriva del JugadorPartido, NO de req.body.equipo: si se toma del body, quien
    // tenga stats.capture en su propio equipo puede declararlo y después apuntar el registro al
    // jugador de cualquier otro equipo, en cualquier partido. El permiso validaba la declaración
    // del que llama en vez del recurso.
    resolveEquipoId: async (req) => getEquipoIdFromJugadorPartido(req.body?.jugadorPartido),
    missingMessage: 'Se requiere un jugadorPartido válido para validar permisos de captura',
  }),
  async (req, res) => {
    try {
      const { set, jugadorPartido, jugador, throws, hits, outs, catches, survive } = req.body;
      if (!set || !jugadorPartido || !jugador) {
        return res.status(400).json({ error: 'set, jugadorPartido y jugador son obligatorios' });
      }
      // El equipo del registro es el del JugadorPartido, ya resuelto al validar permisos.
      const equipo = req.equipoIdPermisos;

      const nuevo = new EstadisticasJugadorSet({
        set,
        jugadorPartido,
        jugador,
        equipo,
        throws,
        hits,
        outs,
        catches,
        survive,
        creadoPor: req.user.uid,
      });

      // Autoguardado puro: la fila queda en su estado default ('privada') y NO se encola
      // ninguna solicitud acá. Antes cada POST/PUT metía la fila a una `SolicitudEdicion` de
      // inmediato — eso es justo lo que impedía tener un autoguardado por fila sin que la
      // bandeja del organizador cambiara en vivo mientras el usuario todavía está tecleando.
      // El pedido formal de oficialización ahora es explícito: POST /set/:setId/pedir-oficial.
      const guardado = await nuevo.save();

      // Actualizar estadísticas agregadas automáticamente
      try {
        // 1. Actualizar totales del jugador en el partido
        await actualizarEstadisticasJugadorPartido(jugadorPartido, req.user.uid, false);
        
        // 2. Obtener el partido del jugador para actualizar estadísticas del equipo
        const jugPartido = await JugadorPartido.findById(jugadorPartido);
        if (jugPartido) {
          await actualizarEstadisticasEquipoPartido(jugPartido.partido, equipo, req.user.uid);
        }
        
        console.log('✅ Estadísticas agregadas actualizadas automáticamente');
      } catch (aggError) {
        console.error('⚠️ Error actualizando estadísticas agregadas:', aggError);
        // No falla la petición principal, solo log el error
      }

      // Colaboración en vivo: quien tenga este {set, equipo} abierto en otra pestaña ve esta
      // fila sin refrescar. Mismo patrón que `planilla:estadisticas_actualizadas`.
      req.app.get('io')?.to(`set:${set}:${equipo}`).emit('set:estadisticas_actualizadas', {
        setId: String(set),
        equipoId: String(equipo),
        estadisticas: [guardado],
      });

      res.status(201).json(guardado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al crear estadísticas de set' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-set/{id}:
 *   put:
 *     summary: Actualiza estadísticas de set de un jugador
 *     tags: [EstadisticasJugadorSet]
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
 *             type: object
 *             properties:
 *               throws:
 *                 type: number
 *               hits:
 *                 type: number
 *               outs:
 *                 type: number
 *               catches:
 *                 type: number
 *               survive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Estadísticas actualizadas
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       404:
 *         description: No encontrado
 */
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorSet.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrado' });

      const equipoId = await getEquipoIdFromEstadisticaJugadorSet(req.params.id);
      const allowed = await hasTeamPermission({
        equipoId,
        usuarioId: req.user.uid,
        rolGlobal: req.user.rol,
        permission: 'stats.edit',
      });

      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permisos para editar estadísticas de este equipo' });
      }

      // Si la fila YA pasó alguna vez por el flujo de aprobación (está pendiente, publicada
      // en la organización o públicamente) se re-encola: editar un dato ya visible no puede
      // cambiarlo en silencio, tiene que volver a pasar por el organizador. Si todavía es
      // 'privada' (nunca se pidió oficial) o 'rechazada' (el DT la está corrigiendo antes de
      // volver a pedirla), es autoguardado puro — es el caso común de tipear en vivo, y acá no
      // hay nada publicado que proteger.
      const yaPasoPorAprobacion = ['pendiente_aprobacion', 'organizacion', 'publica'].includes(
        item.estadoPublicacion,
      );

      const campos = ['throws', 'hits', 'outs', 'catches', 'survive'];
      for (const c of campos) {
        if (Object.prototype.hasOwnProperty.call(req.body, c)) {
          item[c] = req.body[c];
        }
      }

      const actualizado = await item.save();

      if (yaPasoPorAprobacion) {
        const setDoc = await SetPartido.findById(item.set).select('partido').lean();
        if (setDoc?.partido) {
          const visibilidadObjetivo = normalizarVisibilidadObjetivo(req.body?.visibilidadObjetivo ?? item.visibilidadObjetivo);
          const solicitud = await encolarSolicitudStatsLoteSet({
            setId: item.set,
            statId: actualizado._id,
            partidoId: setDoc.partido,
            equipoId: item.equipo,
            creadoPor: req.user.uid,
            visibilidadObjetivo,
          });

          if (solicitud.queued) {
            actualizado.estadoPublicacion = 'pendiente_aprobacion';
            actualizado.visibilidadObjetivo = visibilidadObjetivo;
            actualizado.solicitudPublicacion = solicitud.solicitudId;
            await actualizado.save();
          } else if (solicitud.autoEstado) {
            // Amistoso: sin organizador que apruebe, la visibilidad se aplica directo.
            actualizado.estadoPublicacion = solicitud.autoEstado;
            actualizado.visibilidadObjetivo = visibilidadObjetivo;
            await actualizado.save();
          }
        }
      }

      // Actualizar estadísticas agregadas automáticamente
      try {
        // 1. Actualizar totales del jugador en el partido
        await actualizarEstadisticasJugadorPartido(item.jugadorPartido, req.user.uid, false);
        
        // 2. Obtener el partido del jugador para actualizar estadísticas del equipo
        const jugPartido = await JugadorPartido.findById(item.jugadorPartido);
        if (jugPartido) {
          await actualizarEstadisticasEquipoPartido(jugPartido.partido, item.equipo, req.user.uid);
        }
        
        console.log('✅ Estadísticas agregadas actualizadas automáticamente');
      } catch (aggError) {
        console.error('⚠️ Error actualizando estadísticas agregadas:', aggError);
        // No falla la petición principal, solo log el error
      }

      req.app.get('io')?.to(`set:${item.set}:${item.equipo}`).emit('set:estadisticas_actualizadas', {
        setId: String(item.set),
        equipoId: String(item.equipo),
        estadisticas: [actualizado],
      });

      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al actualizar' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-set/{id}:
 *   delete:
 *     summary: Elimina estadísticas de set de un jugador
 *     tags: [EstadisticasJugadorSet]
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
 *         description: Eliminado correctamente
 *       401:
 *         description: No autorizado
 *       404:
 *         description: No encontrado
 *       500:
 *         description: Error al eliminar
 */
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorSet.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrado' });

      const equipoIdPermisos = await getEquipoIdFromEstadisticaJugadorSet(req.params.id);
      const allowed = await hasTeamPermission({
        equipoId: equipoIdPermisos,
        usuarioId: req.user.uid,
        rolGlobal: req.user.rol,
        permission: 'stats.edit',
      });

      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permisos para eliminar estadísticas de este equipo' });
      }

      // Guardar referencias antes de eliminar
      const jugadorPartidoId = item.jugadorPartido;
      const equipoId = item.equipo;
      const setId = item.set;

      await item.deleteOne();

      req.app.get('io')?.to(`set:${setId}:${equipoId}`).emit('set:estadistica_eliminada', {
        setId: String(setId),
        equipoId: String(equipoId),
        jugadorPartido: String(jugadorPartidoId),
      });

      // Actualizar estadísticas agregadas automáticamente
      try {
        // 1. Actualizar totales del jugador en el partido
        await actualizarEstadisticasJugadorPartido(jugadorPartidoId, req.user.uid, false);
        
        // 2. Obtener el partido del jugador para actualizar estadísticas del equipo
        const jugPartido = await JugadorPartido.findById(jugadorPartidoId);
        if (jugPartido) {
          await actualizarEstadisticasEquipoPartido(jugPartido.partido, equipoId, req.user.uid);
        }
        
        console.log('✅ Estadísticas agregadas recalculadas después de eliminar');
      } catch (aggError) {
        console.error('⚠️ Error actualizando estadísticas agregadas:', aggError);
        // No falla la petición principal, solo log el error
      }
      
      res.json({ mensaje: 'Eliminado' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-set/resumen-partido/{partidoId}:
 *   get:
 *     summary: Obtiene el resumen por sets de un partido
 *     tags: [EstadisticasJugadorSet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partidoId
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Resumen de sets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 partido:
 *                   type: string
 *                 sets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       numeroSet:
 *                         type: number
 *                       ganadorSet:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           nombre:
 *                             type: string
 *                       estadisticas:
 *                         type: array
 *                         items:
 *                           $ref: '#/components/schemas/EstadisticasJugadorSet'
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/resumen-partido/:partidoId', verificarToken, async (req, res) => {
  try {
    const { partidoId } = req.params;

    // Obtener sets del partido
    const SetPartido = (await import('../../models/Partido/SetPartido.js')).default;
    // Nada de `.populate('ganadorSet')`: es un String con enum ('local' | 'visitante' |
    // 'empate' | 'pendiente'), no una referencia. Desde Mongoose 6 `strictPopulate` está
    // activo por defecto y poblar un campo que no es ref lanza StrictPopulateError, así que
    // esta ruta devolvía 500 en todas sus llamadas. `.lean()` porque abajo se hace spread de
    // cada documento: sobre un Document de Mongoose el spread no copia los campos —quedan en
    // `_doc`— y la respuesta salía con la basura interna del ODM en vez de las estadísticas.
    const setsDelPartido = await SetPartido.find({ partido: partidoId })
      .sort({ numeroSet: 1 })
      .lean();

    // Para cada set, obtener estadísticas de jugadores
    const setsConEstadisticas = await Promise.all(
      setsDelPartido.map(async (set) => {
        const estadisticasSet = await EstadisticasJugadorSet.find({
          set: set._id
        })
        .populate({
          path: 'jugador',
          select: 'nombre apellido numero'
        })
        .populate({
          path: 'equipo',
          select: 'nombre escudo'
        })
        .populate({
          path: 'jugadorPartido',
          select: 'jugador equipo',
          populate: [
            {
              path: 'jugador',
              select: 'nombre apellido numero'
            },
            {
              path: 'equipo',
              select: 'nombre escudo'
            }
          ]
        })
        .lean();

        return {
          ...set,
          estadisticas: estadisticasSet.map(stat => ({
            ...stat,
            jugador: stat.jugadorPartido?.jugador || stat.jugador || null,
            equipo: stat.jugadorPartido?.equipo || stat.equipo || null
          }))
        };
      })
    );

    res.json({
      partido: partidoId,
      sets: setsConEstadisticas
    });

  } catch (error) {
    console.error('Error en resumen de sets del partido:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas por set del partido' });
  }
});

/**
 * @swagger
 * /api/estadisticas/jugador-set/set/{setId}/pedir-oficial:
 *   post:
 *     summary: Pide la oficialización de lo autoguardado en este set, para un equipo puntual
 *     description: >
 *       El autoguardado por fila (POST/PUT de arriba) ya escribe la fila real, pero no la manda
 *       a aprobación — nace 'privada'. Este es el gatillo explícito: junta todas las filas
 *       privadas o rechazadas de {set, equipo} y arma/actualiza UNA sola solicitud, de una vez,
 *       en vez de que la solicitud vaya creciendo en vivo mientras el usuario todavía tipea.
 *     tags: [EstadisticasJugadorSet]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [equipo]
 *             properties:
 *               equipo: { type: string, format: ObjectId }
 *               visibilidadObjetivo: { type: string, enum: [organizacion, publica] }
 *     responses:
 *       200: { description: Solicitud creada/actualizada, o aplicada directo si es amistoso }
 */
router.post(
  '/set/:setId/pedir-oficial',
  // `validarObjectId` valida `req.params.id`, y esta ruta no tiene ese param (es `setId`) — se
  // valida a mano adentro del handler en su lugar.
  verificarToken,
  cargarRolDesdeBD,
  requireTeamPermission({
    permission: 'stats.capture',
    resolveEquipoId: (req) => req.body?.equipo,
    missingMessage: 'Se requiere el equipo para pedir la oficialización',
  }),
  async (req, res) => {
    try {
      const setId = req.params.setId;
      if (!mongoose.Types.ObjectId.isValid(setId)) {
        return res.status(400).json({ error: 'set inválido' });
      }
      const equipo = req.equipoIdPermisos;

      const setDoc = await SetPartido.findById(setId).select('partido').lean();
      if (!setDoc) return res.status(404).json({ error: 'Set no encontrado' });

      const visibilidadObjetivo = normalizarVisibilidadObjetivo(req.body?.visibilidadObjetivo);

      const filas = await EstadisticasJugadorSet.find({
        set: setId,
        equipo,
        estadoPublicacion: { $in: ['privada', 'rechazada'] },
      });

      if (filas.length === 0) {
        return res.json({ pedidas: 0, mensaje: 'No hay filas propias sin pedir en este set' });
      }

      let solicitudId = null;
      let autoEstado = null;

      for (const fila of filas) {
        const solicitud = await encolarSolicitudStatsLoteSet({
          setId,
          statId: fila._id,
          partidoId: setDoc.partido,
          equipoId: equipo,
          creadoPor: req.user.uid,
          visibilidadObjetivo,
        });

        if (solicitud.queued) {
          solicitudId = solicitud.solicitudId;
          fila.estadoPublicacion = 'pendiente_aprobacion';
          fila.visibilidadObjetivo = visibilidadObjetivo;
          fila.solicitudPublicacion = solicitud.solicitudId;
          await fila.save();
        } else if (solicitud.autoEstado) {
          autoEstado = solicitud.autoEstado;
          fila.estadoPublicacion = solicitud.autoEstado;
          fila.visibilidadObjetivo = visibilidadObjetivo;
          await fila.save();
        }
      }

      return res.json({ pedidas: filas.length, solicitudId, autoEstado });
    } catch (error) {
      console.error('Error pidiendo oficialización de set:', error);
      return res.status(500).json({ error: 'Error interno pidiendo la oficialización' });
    }
  },
);

/**
 * @swagger
 * /api/estadisticas/jugador-set/set/{setId}/intercambiar:
 *   post:
 *     summary: Intercambia los números de dos jugadores en el mismo set
 *     description: >
 *       Calcado del intercambio de planilla (POST /planillas-equipo/{id}/estadisticas/intercambiar):
 *       si uno de los dos lados todavía no tenía fila, equivale a "mover los números al otro
 *       jugador"; si los dos ya tenían algo cargado, es un intercambio genuino. El lado que
 *       queda en cero se borra en vez de dejar una fila huérfana.
 *     tags: [EstadisticasJugadorSet]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jugadorPartidoA, jugadorPartidoB]
 *             properties:
 *               jugadorPartidoA: { type: string, format: ObjectId }
 *               jugadorPartidoB: { type: string, format: ObjectId }
 *     responses:
 *       200: { description: Filas intercambiadas }
 */
router.post(
  '/set/:setId/intercambiar',
  // Mismo motivo que en /pedir-oficial: no hay `:id`, `setId` se valida adentro.
  verificarToken,
  cargarRolDesdeBD,
  requireTeamPermission({
    permission: 'stats.edit',
    // Los dos jugadores tienen que ser del mismo equipo — a diferencia de la planilla, acá el
    // equipo no está implícito en ningún contenedor, así que se valida a mano que las dos
    // puntas resuelvan al mismo equipo antes de dejar pasar el intercambio.
    resolveEquipoId: async (req) => {
      const { jugadorPartidoA, jugadorPartidoB } = req.body || {};
      if (!jugadorPartidoA || !jugadorPartidoB) return null;
      const [equipoA, equipoB] = await Promise.all([
        getEquipoIdFromJugadorPartido(jugadorPartidoA),
        getEquipoIdFromJugadorPartido(jugadorPartidoB),
      ]);
      if (!equipoA || !equipoB || String(equipoA) !== String(equipoB)) return null;
      return equipoA;
    },
    missingMessage: 'Los dos jugadores tienen que ser del mismo equipo',
  }),
  async (req, res) => {
    try {
      const setId = req.params.setId;
      if (!mongoose.Types.ObjectId.isValid(setId)) {
        return res.status(400).json({ error: 'set inválido' });
      }
      const { jugadorPartidoA, jugadorPartidoB } = req.body;
      if (jugadorPartidoA === jugadorPartidoB) {
        return res.status(400).json({ error: 'Hacen falta dos jugadores distintos' });
      }
      const equipo = req.equipoIdPermisos;

      const [jpA, jpB, filaA, filaB] = await Promise.all([
        JugadorPartido.findById(jugadorPartidoA).select('jugador').lean(),
        JugadorPartido.findById(jugadorPartidoB).select('jugador').lean(),
        EstadisticasJugadorSet.findOne({ set: setId, jugadorPartido: jugadorPartidoA }).lean(),
        EstadisticasJugadorSet.findOne({ set: setId, jugadorPartido: jugadorPartidoB }).lean(),
      ]);
      if (!jpA || !jpB) return res.status(404).json({ error: 'jugadorPartido no encontrado' });

      const VACIO = { throws: 0, hits: 0, outs: 0, catches: 0, survive: false };
      const esVacio = (v) => !v.throws && !v.hits && !v.outs && !v.catches && !v.survive;

      const valoresA = filaA
        ? { throws: filaA.throws, hits: filaA.hits, outs: filaA.outs, catches: filaA.catches, survive: filaA.survive }
        : VACIO;
      const valoresB = filaB
        ? { throws: filaB.throws, hits: filaB.hits, outs: filaB.outs, catches: filaB.catches, survive: filaB.survive }
        : VACIO;

      // jugadorPartidoA se queda con lo que tenía B, y viceversa.
      const aplicar = async (jugadorPartidoId, jugadorId, valoresNuevos) => {
        if (esVacio(valoresNuevos)) {
          await EstadisticasJugadorSet.deleteOne({ set: setId, jugadorPartido: jugadorPartidoId });
          return null;
        }
        return EstadisticasJugadorSet.findOneAndUpdate(
          { set: setId, jugadorPartido: jugadorPartidoId },
          {
            ...valoresNuevos,
            set: setId,
            jugadorPartido: jugadorPartidoId,
            jugador: jugadorId,
            equipo,
            creadoPor: req.user.uid,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      };

      const [resultA, resultB] = await Promise.all([
        aplicar(jugadorPartidoA, jpA.jugador, valoresB),
        aplicar(jugadorPartidoB, jpB.jugador, valoresA),
      ]);

      // Recalcular agregados de los dos jugadores tocados.
      await actualizarEstadisticasJugadorPartido(jugadorPartidoA, req.user.uid, false);
      await actualizarEstadisticasJugadorPartido(jugadorPartidoB, req.user.uid, false);

      const actualizadas = [resultA, resultB].filter(Boolean);
      if (actualizadas.length) {
        req.app.get('io')?.to(`set:${setId}:${equipo}`).emit('set:estadisticas_actualizadas', {
          setId: String(setId),
          equipoId: String(equipo),
          estadisticas: actualizadas,
        });
      }
      if (!resultA) {
        req.app.get('io')?.to(`set:${setId}:${equipo}`).emit('set:estadistica_eliminada', {
          setId: String(setId),
          equipoId: String(equipo),
          jugadorPartido: String(jugadorPartidoA),
        });
      }
      if (!resultB) {
        req.app.get('io')?.to(`set:${setId}:${equipo}`).emit('set:estadistica_eliminada', {
          setId: String(setId),
          equipoId: String(equipo),
          jugadorPartido: String(jugadorPartidoB),
        });
      }

      res.json({
        jugadorPartidoA: resultA,
        jugadorPartidoB: resultB,
      });
    } catch (error) {
      console.error('Error intercambiando estadísticas de set:', error);
      res.status(500).json({ error: 'Error interno intercambiando estadísticas' });
    }
  },
);

export default router;

