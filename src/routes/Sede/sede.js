import express from 'express';
import Sede from '../../models/Sede/Sede.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Sedes
 *   description: Gestión de sedes (predios/clubes con sus canchas)
 */

// Listar sedes
/**
 * @swagger
 * /api/sedes:
 *   get:
 *     summary: Lista sedes
 *     tags: [Sedes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizacion
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de sedes
 *       500:
 *         description: Error al obtener sedes
 */
router.get('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const filtro = {};
    if (req.query.organizacion) filtro.organizacion = req.query.organizacion;
    const sedes = await Sede.find(filtro).lean();
    res.json(sedes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener sedes' });
  }
});

// Obtener sede por ID
/**
 * @swagger
 * /api/sedes/{id}:
 *   get:
 *     summary: Obtiene una sede por ID
 *     tags: [Sedes]
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
 *         description: Sede obtenida
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error al obtener sede
 */
router.get('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const sede = await Sede.findById(req.params.id).lean();
    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });
    res.json(sede);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener sede' });
  }
});

// Crear sede (solo admin global, por ahora)
/**
 * @swagger
 * /api/sedes:
 *   post:
 *     summary: Crea una nueva sede
 *     tags: [Sedes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre:
 *                 type: string
 *               direccion:
 *                 type: string
 *               coordenadas:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *               canchas:
 *                 type: array
 *                 items:
 *                   type: string
 *               organizacion:
 *                 type: string
 *                 format: ObjectId
 *     responses:
 *       201:
 *         description: Sede creada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'No tenés permisos para crear sedes' });
    }

    const { nombre, direccion, coordenadas, canchas, organizacion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre de la sede' });

    const nuevaSede = new Sede({
      nombre,
      direccion,
      coordenadas,
      canchas,
      organizacion: organizacion || null,
      creadoPor: req.user.uid,
      administradores: [req.user.uid],
    });

    const guardada = await nuevaSede.save();
    res.status(201).json(guardada);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al crear sede' });
  }
});

// Actualizar sede (solo admin global, por ahora)
/**
 * @swagger
 * /api/sedes/{id}:
 *   put:
 *     summary: Actualiza una sede
 *     tags: [Sedes]
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
 *         description: Sede actualizada
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
      return res.status(403).json({ error: 'No tenés permisos para modificar sedes' });
    }

    const sede = await Sede.findById(req.params.id);
    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });

    Object.assign(sede, req.body);
    const actualizada = await sede.save();
    res.json(actualizada);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al actualizar sede' });
  }
});

// Eliminar sede (solo admin global, por ahora)
/**
 * @swagger
 * /api/sedes/{id}:
 *   delete:
 *     summary: Elimina una sede
 *     tags: [Sedes]
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
 *         description: Sede eliminada
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'No tenés permisos para eliminar sedes' });
    }

    const sede = await Sede.findByIdAndDelete(req.params.id);
    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });
    res.json({ mensaje: 'Sede eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar sede' });
  }
});

export default router;
