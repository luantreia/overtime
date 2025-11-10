import express from 'express';
import JugadorCompetencia from '../../models/Jugador/JugadorCompetencia.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: JugadorCompetencia
 *   description: Gestión de las relaciones entre jugadores y competencias
 */

/**
 * @swagger
 * /api/jugador-competencia:
 *   get:
 *     summary: Obtiene las relaciones entre jugadores y competencias
 *     description: |
 *       Retorna una lista de relaciones entre jugadores y competencias.
 *       Permite filtrar por ID de competencia.
 *       No requiere autenticación.
 *     tags: [JugadorCompetencia]
 *     parameters:
 *       - in: query
 *         name: competencia
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: Filtrar por ID de competencia (opcional)
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *     responses:
 *       200:
 *         description: Lista de relaciones jugador-competencia obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/JugadorCompetencia'
 *             example:
 *               - _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *                 jugador:
 *                   _id: 5f8d0f3b5d7a8e4c3c8d4f5b
 *                   nombre: "Juan"
 *                   apellido: "Pérez"
 *                   foto: "https://ejemplo.com/fotos/juan-perez.jpg"
 *                 competencia: 5f8d0f3b5d7a8e4c3c8d4f5c
 *                 posicion: "Delantero"
 *                 dorsal: 10
 *                 titular: true
 *                 goles: 5
 *                 asistencias: 3
 *                 tarjetasAmarillas: 1
 *                 tarjetasRojas: 0
 *                 minutosJugados: 450
 *                 activo: true
 *                 creadoPor: "auth0|1234567890"
 *                 createdAt: "2023-01-10T08:15:00.000Z"
 *                 updatedAt: "2023-01-15T10:30:00.000Z"
 *       500:
 *         description: Error del servidor al obtener las relaciones
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', async (req, res) => {
  const { competencia } = req.query;
  const filtro = {};
  if (competencia) filtro.competencia = competencia;

  try {
    const items = await JugadorCompetencia.find(filtro)
      .populate({
        path: 'jugador',
        select: 'nombre apellido foto',
      })
      .lean();

    res.json(items);
  } catch (err) {
    console.error('Error al obtener jugadores competencia', err);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

/**
 * @swagger
 * /api/jugador-competencia/{id}:
 *   get:
 *     summary: Obtiene una relación jugador-competencia por ID
 *     description: |
 *       Obtiene los detalles de una relación específica entre un jugador y una competencia.
 *       No requiere autenticación.
 *     tags: [JugadorCompetencia]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-competencia
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     responses:
 *       200:
 *         description: Relación jugador-competencia obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorCompetencia'
 *             example:
 *               _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *               jugador: 5f8d0f3b5d7a8e4c3c8d4f5b
 *               competencia: 5f8d0f3b5d7a8e4c3c8d4f5c
 *               posicion: "Delantero"
 *               dorsal: 10
 *               titular: true
 *               goles: 5
 *               asistencias: 3
 *               tarjetasAmarillas: 1
 *               tarjetasRojas: 0
 *               minutosJugados: 450
 *               activo: true
 *               creadoPor: "auth0|1234567890"
 *               createdAt: "2023-01-10T08:15:00.000Z"
 *               updatedAt: "2023-01-15T10:30:00.000Z"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor al obtener la relación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const item = await JugadorCompetencia.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Error al obtener' });
  }
});

/**
 * @swagger
 * /api/jugador-competencia:
 *   post:
 *     summary: Crea una nueva relación jugador-competencia
 *     description: |
 *       Crea una nueva relación entre un jugador y una competencia.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorCompetencia]
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
 *               - competencia
 *             properties:
 *               jugador:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID del jugador
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5b
 *               competencia:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID de la competencia
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *               posicion:
 *                 type: string
 *                 description: Posición del jugador en la competencia (opcional)
 *                 example: "Delantero"
 *               dorsal:
 *                 type: number
 *                 description: Número de dorsal (opcional)
 *                 example: 10
 *               titular:
 *                 type: boolean
 *                 description: Indica si el jugador es titular
 *                 default: false
 *     responses:
 *       201:
 *         description: Relación jugador-competencia creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorCompetencia'
 *             example:
 *               _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *               jugador: 5f8d0f3b5d7a8e4c3c8d4f5b
 *               competencia: 5f8d0f3b5d7a8e4c3c8d4f5c
 *               posicion: "Delantero"
 *               dorsal: 10
 *               titular: true
 *               goles: 0
 *               asistencias: 0
 *               tarjetasAmarillas: 0
 *               tarjetasRojas: 0
 *               minutosJugados: 0
 *               activo: true
 *               creadoPor: "auth0|1234567890"
 *               createdAt: "2023-01-10T08:15:00.000Z"
 *               updatedAt: "2023-01-10T08:15:00.000Z"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         description: Error del servidor al crear la relación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const nuevo = new JugadorCompetencia({
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
 * /api/jugador-competencia/{id}:
 *   put:
 *     summary: Actualiza una relación jugador-competencia existente
 *     description: |
 *       Actualiza los detalles de una relación existente entre un jugador y una competencia.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorCompetencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-competencia a actualizar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               posicion:
 *                 type: string
 *                 description: Nueva posición del jugador en la competencia (opcional)
 *                 example: "Mediocampista"
 *               dorsal:
 *                 type: number
 *                 description: Nuevo número de dorsal (opcional)
 *                 example: 7
 *               titular:
 *                 type: boolean
 *                 description: Indica si el jugador es titular (opcional)
 *                 example: true
 *               goles:
 *                 type: number
 *                 description: Cantidad de goles (opcional)
 *                 example: 2
 *               asistencias:
 *                 type: number
 *                 description: Cantidad de asistencias (opcional)
 *                 example: 3
 *               tarjetasAmarillas:
 *                 type: number
 *                 description: Cantidad de tarjetas amarillas (opcional)
 *                 example: 1
 *               tarjetasRojas:
 *                 type: number
 *                 description: Cantidad de tarjetas rojas (opcional)
 *                 example: 0
 *               minutosJugados:
 *                 type: number
 *                 description: Minutos jugados (opcional)
 *                 example: 180
 *               activo:
 *                 type: boolean
 *                 description: Indica si la relación está activa (opcional)
 *                 example: true
 *     responses:
 *       200:
 *         description: Relación jugador-competencia actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorCompetencia'
 *             example:
 *               _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *               jugador: 5f8d0f3b5d7a8e4c3c8d4f5b
 *               competencia: 5f8d0f3b5d7a8e4c3c8d4f5c
 *               posicion: "Mediocampista"
 *               dorsal: 7
 *               titular: true
 *               goles: 2
 *               asistencias: 3
 *               tarjetasAmarillas: 1
 *               tarjetasRojas: 0
 *               minutosJugados: 180
 *               activo: true
 *               creadoPor: "auth0|1234567890"
 *               createdAt: "2023-01-10T08:15:00.000Z"
 *               updatedAt: "2023-01-16T14:30:00.000Z"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor al actualizar la relación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorCompetencia.findById(req.params.id);
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
 * /api/jugador-competencia/{id}:
 *   delete:
 *     summary: Elimina una relación jugador-competencia
 *     description: |
 *       Elimina permanentemente una relación entre un jugador y una competencia.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorCompetencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-competencia a eliminar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     responses:
 *       200:
 *         description: Relación eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   description: Mensaje de confirmación
 *                   example: Relación eliminada correctamente
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor al eliminar la relación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorCompetencia.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    await item.deleteOne();
    res.json({ mensaje: 'Eliminado' });
  } catch {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
