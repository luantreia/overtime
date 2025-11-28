//  /routes/setPartido.js

import express from 'express';
import SetPartido from '../models/Partido/SetPartido.js';
import Partido from '../models/Partido/Partido.js';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../middleware/validacionObjectId.js';
import TimerManager from '../services/TimerManager.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SetPartido
 *   description: Gestión de sets dentro de un partido
 */

// GET /api/set-partido?partido=...
/**
 * @swagger
 * /api/set-partido:
 *   get:
 *     summary: Lista los sets de un partido
 *     tags: [SetPartido]
 *     parameters:
 *       - in: query
 *         name: partido
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de sets
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SetPartido'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         description: Error del servidor
 */
router.get('/', async (req, res) => {
  const { partido } = req.query;
  if (!partido) return res.status(400).json({ error: 'Falta el parámetro partido' });

  try {
    const sets = await SetPartido.find({ partido }).sort('numeroSet').lean();
    res.json(sets);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los sets' });
  }
});

// GET /api/set-partido/:id
/**
 * @swagger
 * /api/set-partido/{id}:
 *   get:
 *     summary: Obtiene un set por ID
 *     tags: [SetPartido]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Set obtenido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SetPartido'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const set = await SetPartido.findById(req.params.id).lean();
    if (!set) return res.status(404).json({ error: 'Set no encontrado' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el set' });
  }
});

// POST /api/set-partido
/**
 * @swagger
 * /api/set-partido:
 *   post:
 *     summary: Crea un nuevo set para un partido
 *     tags: [SetPartido]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [partido, numeroSet]
 *             properties:
 *               partido:
 *                 type: string
 *                 format: ObjectId
 *               numeroSet:
 *                 type: number
 *               ganadorSet:
 *                 type: string
 *                 enum: [local, visitante, empate, pendiente]
 *               estadoSet:
 *                 type: string
 *                 enum: [en_juego, finalizado]
 *     responses:
 *       201:
 *         description: Set creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SetPartido'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { partido, numeroSet } = req.body;
      if (!partido || !numeroSet) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
      }

      // Validar que el partido exista
      const partidoObj = await Partido.findById(partido);
      if (!partidoObj) return res.status(404).json({ error: 'Partido no encontrado' });

      const nuevoSet = new SetPartido({
        ...req.body,
        creadoPor: req.user.uid,
      });

      const guardado = await nuevoSet.save();
      
      // Reload timer manager to pick up new set
      // This ensures the server knows about the new active set and resets timers
      await TimerManager.reloadMatch(partido);
      
      res.status(201).json(guardado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al crear set' });
    }
  }
);

// PUT /api/set-partido/:id
/**
 * @swagger
 * /api/set-partido/{id}:
 *   put:
 *     summary: Actualiza un set
 *     tags: [SetPartido]
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
 *             $ref: '#/components/schemas/SetPartido'
 *     responses:
 *       200:
 *         description: Set actualizado
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const set = await SetPartido.findById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Set no encontrado' });

      // TODO: Podés agregar validación de permisos acá si querés

      Object.assign(set, req.body);
      const actualizado = await set.save();
      
      // If the set status changed to 'finalizado', pause only the set timer (not match timer)
      if (req.body.estadoSet === 'finalizado') {
          await TimerManager.pauseSetOnly(set.partido);
      }
      
      await TimerManager.reloadMatch(set.partido);
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Error al actualizar el set' });
    }
  }
);

// DELETE /api/set-partido/:id
/**
 * @swagger
 * /api/set-partido/{id}:
 *   delete:
 *     summary: Elimina un set
 *     tags: [SetPartido]
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
 *         description: Set eliminado correctamente
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const set = await SetPartido.findById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Set no encontrado' });

      // TODO: Podés validar si el usuario es creador o admin del partido

      await set.deleteOne();
      await TimerManager.reloadMatch(set.partido);
      res.json({ mensaje: 'Set eliminado correctamente' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar el set' });
    }
  }
);

export default router;
