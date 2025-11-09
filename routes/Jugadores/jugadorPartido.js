import express from 'express';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: JugadorPartido
 *   description: Gestión de las participaciones de jugadores en partidos
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     JugadorPartido:
 *       type: object
 *       required:
 *         - jugador
 *         - partido
 *         - equipo
 *         - jugadorTemporada
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único de la participación del jugador en el partido
 *         jugador:
 *           type: string
 *           description: Referencia al jugador
 *         partido:
 *           type: string
 *           description: Referencia al partido
 *         equipo:
 *           type: string
 *           description: Referencia al equipo del jugador en este partido
 *         jugadorTemporada:
 *           type: string
 *           description: Referencia a la relación jugador-temporada
 *         titular:
 *           type: boolean
 *           description: Indica si el jugador es titular en el partido
 *           default: false
 *         posicionInicial:
 *           type: string
 *           description: Posición inicial del jugador en el partido
 *         sustitutoDe:
 *           type: string
 *           description: Referencia al jugador al que sustituye (si es suplente)
 *         minutoEntrada:
 *           type: number
 *           description: Minuto en el que entró el jugador al partido
 *         minutoSalida:
 *           type: number
 *           description: Minuto en el que salió el jugador del partido
 *         motivoCambio:
 *           type: string
 *           description: Razón del cambio (lesión, táctica, etc.)
 *         tarjetaAmarilla:
 *           type: boolean
 *           description: Indica si el jugador recibió tarjeta amarilla
 *           default: false
 *         tarjetaRoja:
 *           type: boolean
 *           description: Indica si el jugador recibió tarjeta roja
 *           default: false
 *         goles:
 *           type: number
 *           description: Cantidad de goles anotados en el partido
 *           default: 0
 *         autogoles:
 *           type: number
 *           description: Cantidad de autogoles anotados en el partido
 *           default: 0
 *         asistencias:
 *           type: number
 *           description: Cantidad de asistencias realizadas en el partido
 *           default: 0
 *         atajadas:
 *           type: number
 *           description: Cantidad de atajadas realizadas (para arqueros)
 *           default: 0
 *         golesRecibidos:
 *           type: number
 *           description: Cantidad de goles recibidos (para arqueros)
 *           default: 0
 *         creadoPor:
 *           type: string
 *           description: ID del usuario que creó el registro
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 *       example:
 *         _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *         jugador: 5f8d0f3b5d7a8e4c3c8d4f5b
 *         partido: 5f8d0f3b5d7a8e4c3c8d4f5c
 *         equipo: 5f8d0f3b5d7a8e4c3c8d4f5d
 *         jugadorTemporada: 5f8d0f3b5d7a8e4c3c8d4f5e
 *         titular: true
 *         posicionInicial: "delantero"
 *         tarjetaAmarilla: false
 *         tarjetaRoja: false
 *         goles: 2
 *         asistencias: 1
 *         creadoPor: "auth0|1234567890"
 *         createdAt: "2023-01-15T10:30:00.000Z"
 *         updatedAt: "2023-01-15T10:30:00.000Z"
 */

/**
 * @swagger
 * /api/jugador-partido:
 *   get:
 *     summary: Obtiene las participaciones de jugadores en partidos
 *     description: |
 *       Retorna una lista de participaciones de jugadores en partidos.
 *       Permite filtrar por ID de partido y/o ID de equipo.
 *     tags: [JugadorPartido]
 *     parameters:
 *       - in: query
 *         name: partido
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del partido para filtrar las participaciones
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del equipo para filtrar las participaciones
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5d
 *     responses:
 *       200:
 *         description: Lista de participaciones de jugadores en partidos obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/JugadorPartido'
 *             example:
 *               - _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *                 jugador: 
 *                   _id: 5f8d0f3b5d7a8e4c3c8d4f5b
 *                   nombre: "Juan Pérez"
 *                   numero: 10
 *                   alias: "JP"
 *                   foto: "https://ejemplo.com/fotos/juan-perez.jpg"
 *                 partido: 5f8d0f3b5d7a8e4c3c8d4f5c
 *                 equipo:
 *                   _id: 5f8d0f3b5d7a8e4c3c8d4f5d
 *                   nombre: "Equipo Rojo"
 *                   escudo: "https://ejemplo.com/escudos/rojo.png"
 *                   tipo: "club"
 *                 titular: true
 *                 posicionInicial: "delantero"
 *                 goles: 2
 *                 asistencias: 1
 *                 tarjetaAmarilla: false
 *                 tarjetaRoja: false
 *                 createdAt: "2023-01-15T10:30:00.000Z"
 *                 updatedAt: "2023-01-15T10:30:00.000Z"
 *       400:
 *         description: Error en los parámetros de consulta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al obtener los datos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', async (req, res) => {
  try {
    const { partido, equipo } = req.query;
    const filtro = {};
    if (partido) filtro.partido = partido;
    if (equipo) filtro.equipo = equipo;

    const items = await JugadorPartido.find(filtro)
      .populate({
        path: 'jugador',
        select: 'nombre numero alias foto',
      })
      .populate({
        path: 'jugadorTemporada',
        populate: {
          path: 'jugadorEquipo',
          populate: {
            path: 'jugador',
            select: 'nombre alias foto',
          },
        },
      })
      .populate({
        path: 'equipo',
        select: 'nombre escudo tipo',
      })
      .lean();

    res.json(items);
  } catch (err) {
    console.error('Error en GET jugador-partido:', err);
    res.status(500).json({ error: 'Error al obtener jugadores del partido' });
  }
});

/**
 * @swagger
 * /api/jugador-partido:
 *   post:
 *     summary: Crea una nueva participación de jugador en un partido
 *     description: |
 *       Crea un nuevo registro de participación de un jugador en un partido.
 *       Requiere autenticación y permisos de administrador.
 *       Crea automáticamente estadísticas iniciales para el jugador en el partido.
 *     tags: [JugadorPartido]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jugador
 *               - partido
 *               - equipo
 *               - jugadorTemporada
 *             properties:
 *               jugador:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID del jugador
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5b
 *               partido:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID del partido
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *               equipo:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID del equipo del jugador
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5d
 *               jugadorTemporada:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID de la relación jugador-temporada
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5e
 *               titular:
 *                 type: boolean
 *                 description: Indica si el jugador es titular
 *                 default: false
 *               posicionInicial:
 *                 type: string
 *                 description: Posición inicial del jugador en el partido
 *                 example: "delantero"
 *     responses:
 *       201:
 *         description: Participación de jugador creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorPartido'
 *       400:
 *         description: Datos de entrada inválidos o faltantes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Datos de entrada inválidos"
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Prohibido - No tiene permisos para realizar esta acción
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al crear la participación
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
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const nuevo = new JugadorPartido({
      ...req.body,
      creadoPor: req.user.uid,
    });

    const guardado = await nuevo.save();

    // Crear automáticamente estadísticas iniciales para este jugador en el partido
    try {
      const { default: EstadisticasJugadorPartido } = await import('../../models/Jugador/EstadisticasJugadorPartido.js');

      const estadisticasIniciales = new EstadisticasJugadorPartido({
        jugadorPartido: guardado._id,
        throws: 0,
        hits: 0,
        outs: 0,
        catches: 0,
        creadoPor: req.user.uid,
      });

      await estadisticasIniciales.save();
      console.log('✅ EstadisticasJugadorPartido iniciales creadas para jugador:', guardado._id);
    } catch (statsError) {
      console.error('⚠️ Error creando estadísticas iniciales:', statsError);
      // No fallar la petición principal
    }

    res.status(201).json(guardado);
  } catch (err) {
    console.error('Error en POST jugador-partido:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/jugador-partido/{id}:
 *   put:
 *     summary: Actualiza una participación de jugador en un partido
 *     description: |
 *       Actualiza los datos de una participación existente de un jugador en un partido.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la participación a actualizar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titular:
 *                 type: boolean
 *                 description: Indica si el jugador es titular
 *               posicionInicial:
 *                 type: string
 *                 description: Posición inicial del jugador en el partido
 *                 example: "delantero"
 *               minutoEntrada:
 *                 type: number
 *                 description: Minuto en que el jugador entró al partido
 *               minutoSalida:
 *                 type: number
 *                 description: Minuto en que el jugador salió del partido
 *               motivoCambio:
 *                 type: string
 *                 description: Razón del cambio (lesión, táctica, etc.)
 *               tarjetaAmarilla:
 *                 type: boolean
 *                 description: Indica si el jugador recibió tarjeta amarilla
 *               tarjetaRoja:
 *                 type: boolean
 *                 description: Indica si el jugador recibió tarjeta roja
 *               goles:
 *                 type: number
 *                 description: Cantidad de goles anotados
 *               asistencias:
 *                 type: number
 *                 description: Cantidad de asistencias realizadas
 *               atajadas:
 *                 type: number
 *                 description: Cantidad de atajadas realizadas (para arqueros)
 *               golesRecibidos:
 *                 type: number
 *                 description: Cantidad de goles recibidos (para arqueros)
 *     responses:
 *       200:
 *         description: Participación de jugador actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorPartido'
 *       400:
 *         description: Datos de entrada inválidos
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
 *         description: Prohibido - No tiene permisos para realizar esta acción
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No se encontró la participación con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al actualizar la participación
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
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorPartido.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    Object.assign(item, req.body);
    const actualizado = await item.save();
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/jugador-partido/{id}:
 *   delete:
 *     summary: Elimina una participación de jugador en un partido
 *     description: |
 *       Elimina permanentemente un registro de participación de un jugador en un partido.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la participación a eliminar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     responses:
 *       200:
 *         description: Participación de jugador eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: "Participación eliminada correctamente"
 *       400:
 *         description: ID inválido o con formato incorrecto
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
 *         description: Prohibido - No tiene permisos para realizar esta acción
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No se encontró la participación con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al eliminar la participación
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
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorPartido.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    // Eliminar también las estadísticas asociadas
    try {
      const { default: EstadisticasJugadorPartido } = await import('../../models/Jugador/EstadisticasJugadorPartido.js');
      await EstadisticasJugadorPartido.deleteMany({ jugadorPartido: req.params.id });
      console.log('✅ EstadisticasJugadorPartido eliminadas para jugador:', req.params.id);
    } catch (statsError) {
      console.error('⚠️ Error eliminando estadísticas:', statsError);
      // No fallar la petición principal
    }

    await item.deleteOne();
    res.json({ mensaje: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
