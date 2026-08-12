import express from 'express';
import Actividad from '../../models/Actividad/Actividad.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Actividades
 *   description: Gestión de actividades (jornadas, lod, talleres, eventos)
 */

// Listar actividades
/**
 * @swagger
 * /api/actividades:
 *   get:
 *     summary: Lista actividades
 *     tags: [Actividades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sede
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: organizacion
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *       - in: query
 *         name: desde
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: hasta
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Lista de actividades
 *       500:
 *         description: Error al obtener actividades
 */
router.get('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { sede, organizacion, tipo, desde, hasta } = req.query;
    const filtro = {};
    if (sede) filtro.sede = sede;
    if (organizacion) filtro.organizacion = organizacion;
    if (tipo) filtro.tipo = tipo;
    if (desde || hasta) {
      filtro.fechaInicio = {};
      if (desde) filtro.fechaInicio.$gte = new Date(desde);
      if (hasta) filtro.fechaInicio.$lte = new Date(hasta);
    }

    const actividades = await Actividad.find(filtro).sort({ fechaInicio: 1 }).lean();
    res.json(actividades);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener actividades' });
  }
});

// Obtener actividad por ID
/**
 * @swagger
 * /api/actividades/{id}:
 *   get:
 *     summary: Obtiene una actividad por ID
 *     tags: [Actividades]
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
 *         description: Actividad obtenida
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error al obtener actividad
 */
router.get('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const actividad = await Actividad.findById(req.params.id).lean();
    if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada' });
    res.json(actividad);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener actividad' });
  }
});

// Crear actividad (solo admin global, por ahora)
/**
 * @swagger
 * /api/actividades:
 *   post:
 *     summary: Crea una nueva actividad
 *     tags: [Actividades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, tipo, fechaInicio, fechaFin]
 *             properties:
 *               nombre:
 *                 type: string
 *               tipo:
 *                 type: string
 *                 enum: [lod, recreativo, jornada, evento, taller]
 *               sede:
 *                 type: string
 *                 format: ObjectId
 *               ubicacion:
 *                 type: string
 *               organizacion:
 *                 type: string
 *                 format: ObjectId
 *               fechaInicio:
 *                 type: string
 *                 format: date-time
 *               fechaFin:
 *                 type: string
 *                 format: date-time
 *               abiertoA:
 *                 type: string
 *                 enum: [cualquiera, inscriptos, solo_competencia]
 *               permiteEspectadores:
 *                 type: boolean
 *               descripcion:
 *                 type: string
 *               visibilidadPublica:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Actividad creada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'No tenés permisos para crear actividades' });
    }

    const {
      nombre, tipo, sede, ubicacion, organizacion,
      fechaInicio, fechaFin, abiertoA, permiteEspectadores,
      descripcion, visibilidadPublica,
    } = req.body;

    if (!nombre || !tipo || !fechaInicio || !fechaFin) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    const nuevaActividad = new Actividad({
      nombre,
      tipo,
      sede: sede || null,
      ubicacion,
      organizacion: organizacion || null,
      fechaInicio,
      fechaFin,
      abiertoA,
      permiteEspectadores,
      descripcion,
      visibilidadPublica,
      creadoPor: req.user.uid,
      administradores: [req.user.uid],
    });

    const guardada = await nuevaActividad.save();
    res.status(201).json(guardada);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al crear actividad' });
  }
});

// Actualizar actividad (solo admin global, por ahora)
/**
 * @swagger
 * /api/actividades/{id}:
 *   put:
 *     summary: Actualiza una actividad
 *     tags: [Actividades]
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
 *         description: Actividad actualizada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'No tenés permisos para modificar actividades' });
    }

    const actividad = await Actividad.findById(req.params.id);
    if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada' });

    Object.assign(actividad, req.body);
    const actualizada = await actividad.save();
    res.json(actualizada);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al actualizar actividad' });
  }
});

// Eliminar actividad (solo admin global, por ahora)
/**
 * @swagger
 * /api/actividades/{id}:
 *   delete:
 *     summary: Elimina una actividad
 *     tags: [Actividades]
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
 *         description: Actividad eliminada
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'No tenés permisos para eliminar actividades' });
    }

    const actividad = await Actividad.findByIdAndDelete(req.params.id);
    if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada' });
    res.json({ mensaje: 'Actividad eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar actividad' });
  }
});

export default router;
