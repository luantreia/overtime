import express from 'express';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import EstadisticasJugadorPartido from '../../models/Jugador/EstadisticasJugadorPartido.js';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';
import EstadisticasEquipoPartido from '../../models/Equipo/EstadisticasEquipoPartido.js';
import { requireTeamPermission } from '../../middleware/requireTeamPermission.js';
import {
  hasTeamPermission,
  getEquipoIdFromJugadorPartido,
  getEquipoIdFromEstadisticaJugadorPartido,
} from '../../services/teamPermissionService.js';
import {
  encolarSolicitudStatsLiga,
  normalizarVisibilidadObjetivo,
  resolverFiltroEstadoPublicacion,
} from '../../services/statsApprovalService.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: EstadisticasJugadorPartido
 *   description: Gestión de estadísticas agregadas por jugador en un partido
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     EstadisticasJugadorPartido:
 *       type: object
 *       required:
 *         - jugadorPartido
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único de las estadísticas del jugador en el partido
 *         jugadorPartido:
 *           type: string
 *           format: ObjectId
 *           description: Referencia a la relación Jugador-Partido
 *           example: 64f8d0f3b5d7a8e4c3c8d4f5a
 *         throws:
 *           type: number
 *           description: Cantidad de lanzamientos intentados
 *           default: 0
 *           example: 25
 *         hits:
 *           type: number
 *           description: Cantidad de aciertos
 *           default: 0
 *           example: 14
 *         outs:
 *           type: number
 *           description: Cantidad de fallos
 *           default: 0
 *           example: 11
 *         catches:
 *           type: number
 *           description: Cantidad de recepciones/capturas
 *           default: 0
 *           example: 3
 *         fuente:
 *           type: string
 *           description: Origen de los datos (p. ej. calculo-automatico-sets)
 *           example: calculo-automatico-sets
 *         ultimaActualizacion:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 *         setsCalculados:
 *           type: number
 *           description: Número de sets usados para el cálculo
 *           default: 0
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
 * /api/estadisticas/jugador-partido:
 *   get:
 *     summary: Lista estadísticas por jugador en un partido
 *     description: |
 *       Retorna estadísticas agregadas por jugador en un partido. Permite filtrar por partido, jugadorPartido, jugador o equipo.
 *       Incluye en la respuesta referencias pobladas a jugador, equipo y partido para conveniencia.
 *     tags: [EstadisticasJugadorPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: partido
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del partido para agrupar por jugadorPartido
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
 *         description: Lista de estadísticas obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EstadisticasJugadorPartido'
 *             example:
 *               - _id: 64f8d0f3b5d7a8e4c3c8d4f5a
 *                 jugadorPartido: 64f8d0f3b5d7a8e4c3c8d4f5b
 *                 throws: 25
 *                 hits: 14
 *                 outs: 11
 *                 catches: 3
 *                 fuente: calculo-automatico-sets
 *                 ultimaActualizacion: 2025-01-10T08:15:00.000Z
 *                 createdAt: 2025-01-10T08:15:00.000Z
 *                 updatedAt: 2025-01-10T09:00:00.000Z
 *                 jugador:
 *                   _id: 64f8d0f3b5d7a8e4c3c8d4f5c
 *                   nombre: Juan
 *                   apellido: Pérez
 *                 equipo:
 *                   _id: 64f8d0f3b5d7a8e4c3c8d4f5d
 *                   nombre: Equipo Rojo
 *                 partido:
 *                   _id: 64f8d0f3b5d7a8e4c3c8d4f5e
 *                   nombrePartido: Fecha 1
 *                   fecha: 2025-01-10T06:00:00.000Z
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al obtener estadísticas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { partido, jugadorPartido, jugador, equipo, estadoPublicacion } = req.query;
      
      // Construir filtro dinámico
      const filtro = {};

      const visibilidad = resolverFiltroEstadoPublicacion(estadoPublicacion, req.user?.rol);
      if (!visibilidad.ok) {
        return res.status(visibilidad.status).json({ error: visibilidad.message });
      }
      filtro.estadoPublicacion = { $in: visibilidad.estados };
      
      // Si se solicita por partido, buscar a través de jugadorPartido
      if (partido) {
        // Necesitamos buscar los jugadorPartido que pertenezcan a este partido
        const { default: JugadorPartido } = await import('../../models/Jugador/JugadorPartido.js');
        const jugadoresDelPartido = await JugadorPartido.find({ partido }).select('_id');
        const idsJugadorPartido = jugadoresDelPartido.map(jp => jp._id);
        filtro.jugadorPartido = { $in: idsJugadorPartido };
      }
      
      if (jugadorPartido) filtro.jugadorPartido = jugadorPartido;
      if (jugador) filtro.jugador = jugador;
      if (equipo) filtro.equipo = equipo;

      const estadisticas = await EstadisticasJugadorPartido.find(filtro)
        .populate({
          path: 'jugadorPartido',
          populate: [
            { path: 'jugador', select: 'nombre apellido email' },
            { path: 'equipo', select: 'nombre' },
            { path: 'partido', select: 'nombrePartido fecha' }
          ]
        })
        .lean()
        .sort({ createdAt: 1 });

      // Formatear respuesta para incluir jugador y equipo en el nivel superior
      const estadisticasFormateadas = estadisticas.map(stat => ({
        ...stat,
        jugador: stat.jugadorPartido?.jugador || null,
        equipo: stat.jugadorPartido?.equipo || null,
        partido: stat.jugadorPartido?.partido || null
      }));

      res.json(estadisticasFormateadas);
    } catch (err) {
      console.error('Error al obtener estadísticas:', err);
      res.status(500).json({ error: err.message || 'Error al obtener estadísticas' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-partido:
 *   post:
 *     summary: Crea estadísticas agregadas de un jugador en un partido
 *     description: Crea un registro de estadísticas para un `jugadorPartido`. Algunos campos son opcionales.
 *     tags: [EstadisticasJugadorPartido]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jugadorPartido
 *             properties:
 *               jugadorPartido:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID de la relación Jugador-Partido
 *               throws:
 *                 type: number
 *               hits:
 *                 type: number
 *               outs:
 *                 type: number
 *               catches:
 *                 type: number
 *               tipoCaptura:
 *                 type: string
 *                 description: Tipo de captura de datos
 *                 example: automatica
 *               fuente:
 *                 type: string
 *                 description: Origen de los datos
 *                 example: sistema
 *     responses:
 *       201:
 *         description: Estadísticas creadas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EstadisticasJugadorPartido'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error al crear estadísticas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  requireTeamPermission({
    permission: 'stats.capture',
    resolveEquipoId: async (req) => getEquipoIdFromJugadorPartido(req.body?.jugadorPartido),
    missingMessage: 'Se requiere jugadorPartido válido para validar permisos',
  }),
  async (req, res) => {
    try {
      const { jugadorPartido, throws, hits, outs, catches, tipoCaptura, fuente } = req.body;
      if (!jugadorPartido) {
        return res.status(400).json({ error: 'jugadorPartido es obligatorio' });
      }

      const nuevo = new EstadisticasJugadorPartido({
        jugadorPartido,
        throws,
        hits,
        outs,
        catches,
        tipoCaptura: tipoCaptura || 'automatica',
        fuente: fuente || 'sistema',
        ultimaActualizacion: new Date(),
        creadoPor: req.user.uid,
      });

      const guardado = await nuevo.save();

      const jp = await JugadorPartido.findById(jugadorPartido).select('partido equipo').lean();
      if (jp?.partido) {
        const visibilidadObjetivo = normalizarVisibilidadObjetivo(req.body?.visibilidadObjetivo);
        const solicitud = await encolarSolicitudStatsLiga({
          tipo: 'estadisticasJugadorPartido',
          entidadId: guardado._id,
          partidoId: jp.partido,
          equipoId: jp.equipo,
          creadoPor: req.user.uid,
          visibilidadObjetivo,
        });

        if (solicitud.queued) {
          guardado.estadoPublicacion = 'pendiente_aprobacion';
          guardado.visibilidadObjetivo = visibilidadObjetivo;
          guardado.solicitudPublicacion = solicitud.solicitudId;
          await guardado.save();
        }
      }

      res.status(201).json(guardado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al crear estadísticas' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-partido/{id}:
 *   put:
 *     summary: Actualiza estadísticas de un jugador en un partido
 *     tags: [EstadisticasJugadorPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del registro de estadísticas
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
 *               tipoCaptura:
 *                 type: string
 *               fuente:
 *                 type: string
 *     responses:
 *       200:
 *         description: Estadísticas actualizadas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EstadisticasJugadorPartido'
 *       400:
 *         description: Solicitud inválida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorPartido.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrado' });

      const equipoId = await getEquipoIdFromEstadisticaJugadorPartido(req.params.id);
      const allowed = await hasTeamPermission({
        equipoId,
        usuarioId: req.user.uid,
        rolGlobal: req.user.rol,
        permission: 'stats.edit',
      });

      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permisos para editar estadísticas de este equipo' });
      }

      const campos = ['throws', 'hits', 'outs', 'catches', 'tipoCaptura', 'fuente'];
      for (const c of campos) {
        if (Object.prototype.hasOwnProperty.call(req.body, c)) {
          item[c] = req.body[c];
        }
      }

      item.ultimaActualizacion = new Date();

      const actualizado = await item.save();

      const jp = await JugadorPartido.findById(item.jugadorPartido).select('partido equipo').lean();
      if (jp?.partido) {
        const visibilidadObjetivo = normalizarVisibilidadObjetivo(req.body?.visibilidadObjetivo ?? item.visibilidadObjetivo);
        const solicitud = await encolarSolicitudStatsLiga({
          tipo: 'estadisticasJugadorPartido',
          entidadId: actualizado._id,
          partidoId: jp.partido,
          equipoId: jp.equipo,
          creadoPor: req.user.uid,
          visibilidadObjetivo,
        });

        if (solicitud.queued) {
          actualizado.estadoPublicacion = 'pendiente_aprobacion';
          actualizado.visibilidadObjetivo = visibilidadObjetivo;
          actualizado.solicitudPublicacion = solicitud.solicitudId;
          await actualizado.save();
        }
      }

      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al actualizar' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-partido/{id}:
 *   delete:
 *     summary: Elimina estadísticas de un jugador en un partido
 *     tags: [EstadisticasJugadorPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del registro de estadísticas
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
      const item = await EstadisticasJugadorPartido.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'No encontrado' });

      const equipoId = await getEquipoIdFromEstadisticaJugadorPartido(req.params.id);
      const allowed = await hasTeamPermission({
        equipoId,
        usuarioId: req.user.uid,
        rolGlobal: req.user.rol,
        permission: 'stats.edit',
      });

      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permisos para eliminar estadísticas de este equipo' });
      }

      await item.deleteOne();
      res.json({ mensaje: 'Eliminado' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-partido/resumen-partido/{partidoId}:
 *   get:
 *     summary: Obtiene un resumen de estadísticas por partido
 *     description: |
 *       Devuelve estadísticas de jugadores y equipos para un partido específico.
 *     tags: [EstadisticasJugadorPartido]
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
 *         description: Resumen obtenido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jugadores:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EstadisticasJugadorPartido'
 *                 equipos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       nombre:
 *                         type: string
 *                       escudo:
 *                         type: string
 *                       throws:
 *                         type: number
 *                       hits:
 *                         type: number
 *                       outs:
 *                         type: number
 *                       catches:
 *                         type: number
 *                       efectividad:
 *                         type: string
 *                       jugadores:
 *                         type: number
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/resumen-partido/:partidoId', verificarToken, async (req, res) => {
  try {
    const { partidoId } = req.params;
    
    // Primero obtener los JugadorPartido de este partido
    const jugadoresDelPartido = await JugadorPartido.find({ partido: partidoId }).select('_id');
    const jugadorPartidoIds = jugadoresDelPartido.map(jp => jp._id);
    
    // Obtener estadísticas de jugadores del partido
    const jugadoresStats = await EstadisticasJugadorPartido.find({
      jugadorPartido: { $in: jugadorPartidoIds }
    })
    .populate({
      path: 'jugadorPartido',
      populate: [
        { path: 'jugador', select: 'nombre apellido numero' },
        { path: 'equipo', select: 'nombre escudo' }
      ]
    });

    // Calcular estadísticas por equipo desde EstadisticasEquipoPartido
    const equiposStats = await EstadisticasEquipoPartido.find({ partido: partidoId })
      .populate('equipo', 'nombre escudo');

    // Formatear respuesta
    const equiposFormateados = equiposStats.map(equipo => ({
      _id: equipo.equipo._id,
      nombre: equipo.equipo.nombre,
      escudo: equipo.equipo.escudo,
      throws: equipo.throws || 0,
      hits: equipo.hits || 0,
      outs: equipo.outs || 0,
      catches: equipo.catches || 0,
      efectividad: equipo.throws > 0 ? ((equipo.hits / equipo.throws) * 100).toFixed(1) : 0,
      jugadores: equipo.jugadores || 0
    }));

    res.json({
      jugadores: jugadoresStats,
      equipos: equiposFormateados
    });

  } catch (error) {
    console.error('Error en resumen de partido:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas del partido' });
  }
});

/**
 * @swagger
 * /api/estadisticas/jugador-partido/poblar-iniciales:
 *   post:
 *     summary: Migra y crea estadísticas iniciales (solo admin)
 *     description: Ejecuta un proceso de migración para poblar estadísticas iniciales desde sets.
 *     tags: [EstadisticasJugadorPartido]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Migración completada
 *       403:
 *         description: Prohibido - Solo administradores
 *       500:
 *         description: Error en migración
 */
router.post('/poblar-iniciales', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    // Solo administradores pueden ejecutar esta migración
    if (!req.user.roles || !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: 'Solo administradores pueden ejecutar esta migración' });
    }

    const { poblarEstadisticasIniciales } = await import('../../utils/estadisticasAggregator.js');
    
    console.log('🚀 Iniciando migración de estadísticas iniciales...');
    await poblarEstadisticasIniciales();
    
    res.json({ 
      mensaje: 'Migración de estadísticas iniciales completada',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error en migración:', error);
    res.status(500).json({ error: 'Error en migración de estadísticas iniciales' });
  }
});

/**
 * @swagger
 * /api/estadisticas/jugador-partido/debug:
 *   get:
 *     summary: Endpoint de diagnóstico para depuración
 *     tags: [EstadisticasJugadorPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: partido
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del partido a inspeccionar
 *     responses:
 *       200:
 *         description: Datos de depuración
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/debug', verificarToken, async (req, res) => {
  try {
    const { partido } = req.query;
    
    const debugData = {
      partidoId: partido,
      timestamp: new Date(),
      estadisticasJugadorSet: [],
      estadisticasJugadorPartido: [],
      estadisticasEquipoPartido: [],
      jugadorPartido: []
    };

    if (partido) {
      // Jugadores del partido
      debugData.jugadorPartido = await JugadorPartido.find({
        partido: partido
      }).populate('jugador', 'nombre apellido').populate('equipo', 'nombre').lean();

      // Estadísticas por set
      debugData.estadisticasJugadorSet = await EstadisticasJugadorSet.find({
        'jugadorPartido.partido': partido
      }).populate('jugadorPartido', 'jugador equipo').lean();

      // Estadísticas por jugador en partido
      const jugadorPartidoIds = debugData.jugadorPartido.map(jp => jp._id);
      debugData.estadisticasJugadorPartido = await EstadisticasJugadorPartido.find({
        jugadorPartido: { $in: jugadorPartidoIds }
      }).populate('jugadorPartido', 'jugador equipo').lean();

      // Estadísticas por equipo
      debugData.estadisticasEquipoPartido = await EstadisticasEquipoPartido.find({
        partido: partido
      }).populate('equipo', 'nombre').lean();
    }

    res.json(debugData);
  } catch (error) {
    console.error('Error en debug:', error);
    res.status(500).json({ error: 'Error en debug', details: error.message });
  }
});

/**
 * @swagger
 * /api/estadisticas/jugador-partido/convertir-a-automaticas/{partidoId}:
 *   put:
 *     summary: Convierte estadísticas manuales a automáticas para un partido
 *     description: Convierte todas las estadísticas manuales de un partido a estadísticas automáticas.
 *     tags: [EstadisticasJugadorPartido]
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
 *         description: Conversión completada
 *       400:
 *         description: Error de validación (partido no encontrado o sin sets)
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.put('/convertir-a-automaticas/:partidoId', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { partidoId } = req.params;
    const { convertirEstadisticasManualesAAutomaticas } = await import('../../utils/estadisticasAggregator.js');

    console.log('🔄 Solicitud de conversión de estadísticas manuales a automáticas para partido:', partidoId);

    const resultado = await convertirEstadisticasManualesAAutomaticas(partidoId, req.user.uid);

    res.json({
      mensaje: 'Conversión completada',
      ...resultado
    });

  } catch (error) {
    console.error('❌ Error en conversión de estadísticas:', error);

    // Si es un error de validación (partido no existe, no tiene sets), devolver 400
    if (error.message.includes('no encontrado') || error.message.includes('no tiene sets')) {
      return res.status(400).json({
        error: error.message,
        tipo: 'validacion'
      });
    }

    // Para otros errores, devolver 500
    res.status(500).json({
      error: 'Error interno del servidor',
      detalle: error.message
    });
  }
});


export default router;
