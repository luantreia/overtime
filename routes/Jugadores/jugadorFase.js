import express from 'express';
import  JugadorFase  from '../../models/Jugador/JugadorFase.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: JugadorFase
 *   description: Gestión de las relaciones entre jugadores y fases de competencia
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     JugadorFase:
 *       type: object
 *       required:
 *         - jugadorTemporada
 *         - participacionFase
 *         - estado
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único de la relación jugador-fase
 *         jugadorTemporada:
 *           type: string
 *           format: ObjectId
 *           description: Referencia a la relación jugador-temporada
 *           example: 5f8d0f3b5d7a8e4c3c8d4f5b
 *         participacionFase:
 *           type: string
 *           format: ObjectId
 *           description: Referencia a la participación del equipo en la fase
 *           example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *         estado:
 *           type: string
 *           enum: [activo, inactivo, lesionado, suspendido]
 *           description: Estado del jugador en la fase
 *           example: activo
 *         rol:
 *           type: string
 *           description: Rol del jugador en el equipo durante la fase
 *           example: delantero
 *         goles:
 *           type: number
 *           description: Goles anotados en la fase
 *           default: 0
 *         asistencias:
 *           type: number
 *           description: Asistencias realizadas en la fase
 *           default: 0
 *         tarjetasAmarillas:
 *           type: number
 *           description: Tarjetas amarillas recibidas en la fase
 *           default: 0
 *         tarjetasRojas:
 *           type: number
 *           description: Tarjetas rojas recibidas en la fase
 *           default: 0
 *         partidosJugados:
 *           type: number
 *           description: Partidos jugados en la fase
 *           default: 0
 *         partidosTitular:
 *           type: number
 *           description: Partidos como titular en la fase
 *           default: 0
 *         minutosJugados:
 *           type: number
 *           description: Minutos jugados en la fase
 *           default: 0
 *         golesRecibidos:
 *           type: number
 *           description: Goles recibidos (para arqueros)
 *           default: 0
 *         vallasInvictas:
 *           type: number
 *           description: Vallas invictas (para arqueros)
 *           default: 0
 *         atajadas:
 *           type: number
 *           description: Atajadas realizadas (para arqueros)
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
 *         jugadorTemporada: 5f8d0f3b5d7a8e4c3c8d4f5b
 *         participacionFase: 5f8d0f3b5d7a8e4c3c8d4f5c
 *         estado: "activo"
 *         rol: "delantero"
 *         goles: 5
 *         asistencias: 3
 *         tarjetasAmarillas: 1
 *         tarjetasRojas: 0
 *         partidosJugados: 10
 *         partidosTitular: 8
 *         minutosJugados: 850
 *         golesRecibidos: 0
 *         vallasInvictas: 0
 *         atajadas: 0
 *         creadoPor: "auth0|1234567890"
 *         createdAt: "2023-01-15T10:30:00.000Z"
 *         updatedAt: "2023-01-15T10:30:00.000Z"
 */

/**
 * @swagger
 * /api/jugador-fase:
 *   get:
 *     summary: Obtiene las relaciones entre jugadores y fases
 *     description: |
 *       Retorna una lista de relaciones entre jugadores y fases de competencia.
 *       Permite filtrar por jugadorTemporada y/o participacionFase.
 *     tags: [JugadorFase]
 *     parameters:
 *       - in: query
 *         name: jugadorTemporada
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-temporada para filtrar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5b
 *       - in: query
 *         name: participacionFase
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la participación en la fase para filtrar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *     responses:
 *       200:
 *         description: Lista de relaciones jugador-fase obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/JugadorFase'
 *             example:
 *               - _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *                 jugadorTemporada:
 *                   _id: 5f8d0f3b5d7a8e4c3c8d4f5b
 *                   jugadorEquipo:
 *                     jugador:
 *                       _id: 5f8d0f3b5d7a8e4c3c8d4f5d
 *                       nombre: "Juan Pérez"
 *                       alias: "JP"
 *                       foto: "https://ejemplo.com/fotos/juan-perez.jpg"
 *                       genero: "masculino"
 *                 participacionFase: 5f8d0f3b5d7a8e4c3c8d4f5c
 *                 estado: "activo"
 *                 goles: 5
 *                 asistencias: 3
 *                 partidosJugados: 10
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
  const { jugadorTemporada, participacionFase } = req.query;
  const filtro = {};
  if (jugadorTemporada) filtro.jugadorTemporada = jugadorTemporada;
  if (participacionFase) filtro.participacionFase = participacionFase;

  try {
    const items = await JugadorFase.find(filtro)
      .populate({
        path: 'jugadorTemporada',
        populate: {
          path: 'jugadorEquipo',
          populate: {
            path: 'jugador',
            select: 'nombre alias foto genero',
          },
        },
      })
      .lean();

    res.json(items);
  } catch (err) {
    console.error('Error al obtener JugadorFase:', err);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

/**
 * @swagger
 * /api/jugador-fase/{id}:
 *   get:
 *     summary: Obtiene una relación jugador-fase por su ID
 *     description: |
 *       Retorna los detalles de una relación específica entre un jugador y una fase de competencia.
 *     tags: [JugadorFase]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-fase a obtener
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     responses:
 *       200:
 *         description: Relación jugador-fase encontrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorFase'
 *             example:
 *               _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *               jugadorTemporada: 5f8d0f3b5d7a8e4c3c8d4f5b
 *               participacionFase: 5f8d0f3b5d7a8e4c3c8d4f5c
 *               estado: "activo"
 *               rol: "delantero"
 *               goles: 5
 *               asistencias: 3
 *               partidosJugados: 10
 *               createdAt: "2023-01-15T10:30:00.000Z"
 *               updatedAt: "2023-01-15T10:30:00.000Z"
 *       400:
 *         description: ID inválido o con formato incorrecto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No se encontró la relación con el ID proporcionado
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
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const item = await JugadorFase.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Error al obtener' });
  }
});

/**
 * @swagger
 * /api/jugador-fase:
 *   post:
 *     summary: Crea una nueva relación jugador-fase
 *     description: |
 *       Crea un nuevo registro de relación entre un jugador y una fase de competencia.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorFase]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jugadorTemporada
 *               - participacionFase
 *               - estado
 *             properties:
 *               jugadorTemporada:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID de la relación jugador-temporada
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5b
 *               participacionFase:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID de la participación del equipo en la fase
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *               estado:
 *                 type: string
 *                 enum: [activo, inactivo, lesionado, suspendido]
 *                 description: Estado inicial del jugador en la fase
 *                 example: activo
 *               rol:
 *                 type: string
 *                 description: Rol del jugador en el equipo durante la fase
 *                 example: delantero
 *               goles:
 *                 type: number
 *                 description: Goles iniciales (opcional, por defecto 0)
 *                 default: 0
 *               asistencias:
 *                 type: number
 *                 description: Asistencias iniciales (opcional, por defecto 0)
 *                 default: 0
 *     responses:
 *       201:
 *         description: Relación jugador-fase creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorFase'
 *       400:
 *         description: Datos de entrada inválidos o faltantes
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
 *       500:
 *         description: Error del servidor al crear la relación
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
    const nuevo = new JugadorFase({
      ...req.body,
      creadoPor: req.user.uid,
    });
    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/jugador-fase/{id}:
 *   put:
 *     summary: Actualiza una relación jugador-fase existente
 *     description: |
 *       Actualiza los datos de una relación existente entre un jugador y una fase de competencia.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorFase]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-fase a actualizar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [activo, inactivo, lesionado, suspendido]
 *                 description: Nuevo estado del jugador en la fase
 *               rol:
 *                 type: string
 *                 description: Nuevo rol del jugador en el equipo durante la fase
 *               goles:
 *                 type: number
 *                 description: Cantidad actualizada de goles
 *               asistencias:
 *                 type: number
 *                 description: Cantidad actualizada de asistencias
 *               tarjetasAmarillas:
 *                 type: number
 *                 description: Cantidad actualizada de tarjetas amarillas
 *               tarjetasRojas:
 *                 type: number
 *                 description: Cantidad actualizada de tarjetas rojas
 *               partidosJugados:
 *                 type: number
 *                 description: Cantidad actualizada de partidos jugados
 *               partidosTitular:
 *                 type: number
 *                 description: Cantidad actualizada de partidos como titular
 *               minutosJugados:
 *                 type: number
 *                 description: Cantidad actualizada de minutos jugados
 *               golesRecibidos:
 *                 type: number
 *                 description: Cantidad actualizada de goles recibidos (para arqueros)
 *               vallasInvictas:
 *                 type: number
 *                 description: Cantidad actualizada de vallas invictas (para arqueros)
 *               atajadas:
 *                 type: number
 *                 description: Cantidad actualizada de atajadas (para arqueros)
 *     responses:
 *       200:
 *         description: Relación jugador-fase actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorFase'
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
 *         description: No se encontró la relación con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al actualizar la relación
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
    const item = await JugadorFase.findById(req.params.id);
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
 * /api/jugador-fase/{id}:
 *   delete:
 *     summary: Elimina una relación jugador-fase
 *     description: |
 *       Elimina permanentemente un registro de relación entre un jugador y una fase de competencia.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorFase]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-fase a eliminar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     responses:
 *       200:
 *         description: Relación jugador-fase eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: "Relación jugador-fase eliminada correctamente"
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
 *         description: No se encontró la relación con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al eliminar la relación
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
    const item = await JugadorFase.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    await item.deleteOne();
    res.json({ mensaje: 'Eliminado' });
  } catch {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
