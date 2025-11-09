import express from 'express';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import EstadisticasJugadorSet from '../../models/Jugador/EstadisticasJugadorSet.js';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';
import { actualizarEstadisticasJugadorPartido, actualizarEstadisticasEquipoPartido } from '../../utils/estadisticasAggregator.js';

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
      const { set, jugadorPartido, jugador, equipo } = req.query;
      
      // Construir filtro dinámico
      const filtro = {};
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
  async (req, res) => {
    try {
      const { set, jugadorPartido, jugador, equipo, throws, hits, outs, catches } = req.body;
      if (!set || !jugadorPartido || !jugador || !equipo) {
        return res.status(400).json({ error: 'set, jugadorPartido, jugador y equipo son obligatorios' });
      }

      const nuevo = new EstadisticasJugadorSet({
        set,
        jugadorPartido,
        jugador,
        equipo,
        throws,
        hits,
        outs,
        catches,
        creadoPor: req.user.uid,
      });

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

      const campos = ['throws', 'hits', 'outs', 'catches'];
      for (const c of campos) {
        if (Object.prototype.hasOwnProperty.call(req.body, c)) {
          item[c] = req.body[c];
        }
      }

      const actualizado = await item.save();
      
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

      // Guardar referencias antes de eliminar
      const jugadorPartidoId = item.jugadorPartido;
      const equipoId = item.equipo;

      await item.deleteOne();
      
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
    const setsDelPartido = await SetPartido.find({ partido: partidoId })
      .populate('ganadorSet', 'nombre')
      .sort({ numeroSet: 1 });

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
        });

        return {
          ...set.toObject(),
          estadisticas: estadisticasSet.map(stat => ({
            ...stat,
            jugador: stat.jugadorPartido?.jugador || null,
            equipo: stat.jugadorPartido?.equipo || null
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

export default router;

