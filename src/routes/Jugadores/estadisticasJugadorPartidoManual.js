import express from 'express';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import EstadisticasJugadorPartidoManual from '../../models/Jugador/EstadisticasJugadorPartidoManual.js';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';
import { requireTeamPermission } from '../../middleware/requireTeamPermission.js';
import {
  hasTeamPermission,
  getEquipoIdFromJugadorPartido,
  getEquipoIdFromEstadisticaJugadorPartidoManual,
} from '../../services/teamPermissionService.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: EstadisticasJugadorPartidoManual
 *   description: Gestión de estadísticas ingresadas manualmente por jugador en un partido
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     EstadisticasJugadorPartidoManual:
 *       type: object
 *       required:
 *         - jugadorPartido
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único del registro manual
 *         jugadorPartido:
 *           type: string
 *           format: ObjectId
 *           description: Referencia a la relación Jugador-Partido
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
 *         fuente:
 *           type: string
 *           description: Origen de los datos (p. ej. ingreso-manual)
 *           example: ingreso-manual
 *         ultimaActualizacion:
 *           type: string
 *           format: date-time
 *         notas:
 *           type: string
 *           description: Notas o comentarios adicionales
 *         version:
 *           type: number
 *           description: Versión del registro
 *           default: 1
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
 * /api/estadisticas/jugador-partido-manual:
 *   get:
 *     summary: Lista estadísticas manuales por jugador en un partido
 *     description: Permite filtrar por partido, jugadorPartido, jugador o equipo.
 *     tags: [EstadisticasJugadorPartidoManual]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: partido
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del partido para buscar estadísticas manuales
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
 *         description: Lista de estadísticas manuales obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EstadisticasJugadorPartidoManual'
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
      const { partido, jugadorPartido, jugador, equipo } = req.query;

      // Construir filtro dinámico
      const filtro = {};

      // Si se solicita por partido, buscar a través de jugadorPartido
      if (partido) {
        const { default: JugadorPartido } = await import('../../models/Jugador/JugadorPartido.js');
        const jugadoresDelPartido = await JugadorPartido.find({ partido }).select('_id');
        const idsJugadorPartido = jugadoresDelPartido.map(jp => jp._id);
        filtro.jugadorPartido = { $in: idsJugadorPartido };
      }

      if (jugadorPartido) filtro.jugadorPartido = jugadorPartido;
      if (jugador) filtro.jugador = jugador;
      if (equipo) filtro.equipo = equipo;

      const estadisticas = await EstadisticasJugadorPartidoManual.find(filtro)
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
      console.error('Error al obtener estadísticas manuales:', err);
      res.status(500).json({ error: err.message || 'Error al obtener estadísticas manuales' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-partido-manual:
 *   post:
 *     summary: Crea estadísticas manuales de un jugador en un partido
 *     description: Evita duplicados por jugadorPartido; devuelve 409 si ya existe.
 *     tags: [EstadisticasJugadorPartidoManual]
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
 *               throws:
 *                 type: number
 *               hits:
 *                 type: number
 *               outs:
 *                 type: number
 *               catches:
 *                 type: number
 *               notas:
 *                 type: string
 *     responses:
 *       201:
 *         description: Estadísticas manuales creadas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EstadisticasJugadorPartidoManual'
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       409:
 *         description: Duplicado - ya existe una estadística manual para ese jugadorPartido
 *       500:
 *         description: Error del servidor
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
      const { jugadorPartido, throws, hits, outs, catches, notas } = req.body;
      if (!jugadorPartido) {
        return res.status(400).json({ error: 'jugadorPartido es obligatorio' });
      }

      // Verificar si ya existe una estadística para este jugadorPartido
      const existente = await EstadisticasJugadorPartidoManual.findOne({ jugadorPartido });
      if (existente) {
        return res.status(409).json({
          error: 'Ya existe una estadística manual para este jugador en el partido',
          mensaje: 'Si deseas modificar las estadísticas existentes, usa el método PUT para actualizar.',
          estadisticaExistente: existente._id,
          tipo: 'duplicado'
        });
      }

      const nuevo = new EstadisticasJugadorPartidoManual({
        jugadorPartido,
        throws,
        hits,
        outs,
        catches,
        notas,
        ultimaActualizacion: new Date(),
        creadoPor: req.user.uid,
      });

      const guardado = await nuevo.save();
      res.status(201).json(guardado);
    } catch (err) {
      // Manejar específicamente errores de duplicado de MongoDB
      if (err.code === 11000 || err.message.includes('duplicate key')) {
        return res.status(409).json({
          error: 'Ya existe una estadística manual para este jugador en el partido',
          mensaje: 'No se pueden crear estadísticas duplicadas para el mismo jugador.',
          tipo: 'duplicado'
        });
      }

      console.error('Error al crear estadísticas manuales:', err);
      res.status(400).json({ error: err.message || 'Error al crear estadísticas manuales' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-partido-manual/upsert:
 *   put:
 *     summary: Crea o actualiza estadísticas manuales (upsert)
 *     description: Si no existe, crea (201); si existe, actualiza (200).
 *     tags: [EstadisticasJugadorPartidoManual]
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
 *               throws:
 *                 type: number
 *               hits:
 *                 type: number
 *               outs:
 *                 type: number
 *               catches:
 *                 type: number
 *               notas:
 *                 type: string
 *     responses:
 *       200:
 *         description: Estadísticas manuales actualizadas
 *       201:
 *         description: Estadísticas manuales creadas
 *       400:
 *         description: Solicitud inválida
 *       401:
 *         description: No autorizado
 */
router.put('/upsert', verificarToken, cargarRolDesdeBD, requireTeamPermission({
  permission: 'stats.edit',
  resolveEquipoId: async (req) => getEquipoIdFromJugadorPartido(req.body?.jugadorPartido),
  missingMessage: 'Se requiere jugadorPartido válido para validar permisos',
}), async (req, res) => {
  try {
    const { jugadorPartido, throws, hits, outs, catches, notas } = req.body;
    if (!jugadorPartido) {
      return res.status(400).json({ error: 'jugadorPartido es obligatorio' });
    }

    // Usar upsert para crear o actualizar
    const estadistica = await EstadisticasJugadorPartidoManual.findOneAndUpdate(
      { jugadorPartido }, // Filtro
      {
        throws,
        hits,
        outs,
        catches,
        notas,
        ultimaActualizacion: new Date(),
        creadoPor: req.user.uid,
        version: { $inc: 1 } // Incrementar versión
      }, // Datos a actualizar
      {
        new: true, // Retornar documento actualizado
        upsert: true, // Crear si no existe
        runValidators: true, // Ejecutar validaciones
        setDefaultsOnInsert: true // Establecer valores por defecto al insertar
      }
    );

    // Determinar si fue creado o actualizado
    const fueCreado = estadistica.createdAt.getTime() === estadistica.updatedAt.getTime();

    res.status(fueCreado ? 201 : 200).json({
      ...estadistica.toObject(),
      operacion: fueCreado ? 'creado' : 'actualizado',
      mensaje: fueCreado
        ? 'Estadísticas manuales creadas exitosamente'
        : 'Estadísticas manuales actualizadas exitosamente'
    });

  } catch (err) {
    console.error('Error en upsert de estadísticas manuales:', err);
    res.status(400).json({ error: err.message || 'Error al guardar estadísticas manuales' });
  }
});
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    /**
     * @swagger
     * /api/estadisticas/jugador-partido-manual/{id}:
     *   put:
     *     summary: Actualiza estadísticas manuales por ID
     *     tags: [EstadisticasJugadorPartidoManual]
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
     *               notas:
     *                 type: string
     *     responses:
     *       200:
     *         description: Actualizado correctamente
     *       400:
     *         description: Solicitud inválida
     *       401:
     *         description: No autorizado
     *       404:
     *         description: No encontrado
     */
    try {
      const item = await EstadisticasJugadorPartidoManual.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Estadísticas manuales no encontradas' });

      const equipoId = await getEquipoIdFromEstadisticaJugadorPartidoManual(req.params.id);
      const allowed = await hasTeamPermission({
        equipoId,
        usuarioId: req.user.uid,
        rolGlobal: req.user.rol,
        permission: 'stats.edit',
      });

      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permisos para editar estadísticas manuales de este equipo' });
      }

      const campos = ['throws', 'hits', 'outs', 'catches', 'notas'];
      for (const c of campos) {
        if (Object.prototype.hasOwnProperty.call(req.body, c)) {
          item[c] = req.body[c];
        }
      }

      item.ultimaActualizacion = new Date();
      item.version = (item.version || 1) + 1; // Incrementar versión

      const actualizado = await item.save();
      res.json({
        ...actualizado.toObject(),
        operacion: 'actualizado',
        mensaje: 'Estadísticas manuales actualizadas exitosamente'
      });
    } catch (err) {
      console.error('Error al actualizar estadísticas manuales:', err);
      res.status(400).json({ error: err.message || 'Error al actualizar estadísticas manuales' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-partido-manual/{id}:
 *   delete:
 *     summary: Elimina estadísticas manuales por ID
 *     tags: [EstadisticasJugadorPartidoManual]
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
      const item = await EstadisticasJugadorPartidoManual.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Estadísticas manuales no encontradas' });

      const equipoId = await getEquipoIdFromEstadisticaJugadorPartidoManual(req.params.id);
      const allowed = await hasTeamPermission({
        equipoId,
        usuarioId: req.user.uid,
        rolGlobal: req.user.rol,
        permission: 'stats.edit',
      });

      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permisos para eliminar estadísticas manuales de este equipo' });
      }

      await item.deleteOne();
      res.json({ mensaje: 'Estadísticas manuales eliminadas' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar estadísticas manuales' });
    }
  }
);

/**
 * @swagger
 * /api/estadisticas/jugador-partido-manual/resumen-partido/{partidoId}:
 *   get:
 *     summary: Obtiene un resumen de estadísticas manuales por partido
 *     tags: [EstadisticasJugadorPartidoManual]
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
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/resumen-partido/:partidoId', verificarToken, async (req, res) => {
  try {
    const { partidoId } = req.params;
    console.log('🔍 Buscando estadísticas manuales para partido:', partidoId);

    // Primero obtener los JugadorPartido de este partido
    const jugadoresDelPartido = await JugadorPartido.find({ partido: partidoId }).select('_id');
    const jugadorPartidoIds = jugadoresDelPartido.map(jp => jp._id);
    console.log('👥 Jugadores del partido encontrados:', jugadorPartidoIds.length);

    // Obtener estadísticas manuales de jugadores del partido
    const jugadoresStats = await EstadisticasJugadorPartidoManual.find({
      jugadorPartido: { $in: jugadorPartidoIds }
    })
    .populate({
      path: 'jugadorPartido',
      populate: [
        { path: 'jugador', select: 'nombre apellido numero' },
        { path: 'equipo', select: 'nombre escudo' }
      ]
    });

    console.log('📊 Estadísticas manuales encontradas:', jugadoresStats.length);
    console.log('📈 Primera estadística:', jugadoresStats[0] || 'Ninguna');

    // Calcular estadísticas por equipo agregando las estadísticas de jugadores
    const equiposMap = {};

    jugadoresStats.forEach(stat => {
      const equipo = stat.jugadorPartido?.equipo;
      console.log('🏆 Procesando estadística para equipo:', equipo?.nombre || 'Sin equipo');
      if (equipo) {
        const equipoId = equipo._id || equipo;

        if (!equiposMap[equipoId]) {
          equiposMap[equipoId] = {
            _id: equipoId,
            nombre: equipo.nombre,
            escudo: equipo.escudo,
            throws: 0,
            hits: 0,
            outs: 0,
            catches: 0,
            jugadores: 0
          };
        }

        equiposMap[equipoId].throws += stat.throws || 0;
        equiposMap[equipoId].hits += stat.hits || 0;
        equiposMap[equipoId].outs += stat.outs || 0;
        equiposMap[equipoId].catches += stat.catches || 0;
        equiposMap[equipoId].jugadores += 1;
      }
    });

    // Calcular efectividad para cada equipo
    Object.values(equiposMap).forEach(equipo => {
      equipo.efectividad = equipo.throws > 0 ? ((equipo.hits / equipo.throws) * 100).toFixed(1) : 0;
    });

    const equiposStats = Object.values(equiposMap);
    console.log('🏆 Estadísticas de equipos calculadas:', equiposStats);

    res.json({
      jugadores: jugadoresStats,
      equipos: equiposStats
    });

  } catch (error) {
    console.error('Error en resumen de estadísticas manuales:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas manuales del partido' });
  }
});

export default router;
