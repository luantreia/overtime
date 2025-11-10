import express from 'express';
import Temporada from '../../models/Competencia/Temporada.js';
import Competencia from '../../models/Competencia/Competencia.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { esAdminDeEntidad } from '../../middlewares/esAdminDeEntidad.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Temporadas
 *   description: Gestión de temporadas dentro de una competencia
 */

// Listar temporadas de una competencia (público)
/**
 * @swagger
 * /api/temporadas:
 *   get:
 *     summary: Lista temporadas de una competencia
 *     tags: [Temporadas]
 *     parameters:
 *       - in: query
 *         name: competencia
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de temporadas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Temporada'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         description: Error al obtener temporadas
 */
router.get('/', async (req, res) => {
  const { competencia } = req.query;
  if (!competencia) return res.status(400).json({ error: 'Falta el parámetro competencia' });

  try {
    const temporadas = await Temporada.find({ competencia }).lean();
    res.json(temporadas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener temporadas' });
  }
});

// Obtener temporada por ID (público)
/**
 * @swagger
 * /api/temporadas/{id}:
 *   get:
 *     summary: Obtiene una temporada por ID
 *     tags: [Temporadas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Temporada obtenida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Temporada'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error al obtener temporada
 */
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const temporada = await Temporada.findById(req.params.id).lean();
    if (!temporada) return res.status(404).json({ error: 'Temporada no encontrada' });
    res.json(temporada);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener temporada' });
  }
});

// Crear temporada (solo usuarios autenticados y admins/administradores competencia)
/**
 * @swagger
 * /api/temporadas:
 *   post:
 *     summary: Crea una nueva temporada
 *     tags: [Temporadas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [competencia, nombre]
 *             properties:
 *               competencia:
 *                 type: string
 *                 format: ObjectId
 *               nombre:
 *                 type: string
 *               descripcion:
 *                 type: string
 *               fechaInicio:
 *                 type: string
 *                 format: date-time
 *               fechaFin:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Temporada creada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post('/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { competencia, nombre, descripcion, fechaInicio, fechaFin } = req.body;
      if (!competencia || !nombre ) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
      }

      // Validar competencia existe y permisos
      const competenciaObj = await Competencia.findById(competencia);
      if (!competenciaObj) return res.status(404).json({ error: 'Competencia no encontrada' });

      const esAdminGlobal = req.user.rol === 'admin';
      const esAdminCompetencia = competenciaObj.administradores?.includes(req.user.uid);
      const esCreadorCompetencia = competenciaObj.creadoPor?.toString() === req.user.uid;

      if (!esAdminGlobal && !esAdminCompetencia && !esCreadorCompetencia) {
        return res.status(403).json({ error: 'No tienes permisos para crear temporadas en esta competencia' });
      }

      const nuevaTemporada = new Temporada({
        competencia,
        nombre,
        descripcion,
        fechaInicio,
        fechaFin,
        creadoPor: req.user.uid,
        administradores: [req.user.uid]
      });

      const guardada = await nuevaTemporada.save();
      res.status(201).json(guardada);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Error al crear temporada' });
    }
  }
);

// Middleware para cargar temporada y validar permisos admin (para PUT y DELETE)
async function cargarTemporadaYValidarAdmin(req, res, next) {
  try {
    const temporada = await Temporada.findById(req.params.id);
    if (!temporada) return res.status(404).json({ error: 'Temporada no encontrada' });

    // Cargar competencia para validar admins
    const competencia = await Competencia.findById(temporada.competencia);

    const esAdminGlobal = req.user.rol === 'admin';
    const esAdminCompetencia = competencia.administradores?.includes(req.user.uid);
    const esAdminTemporada = temporada.administradores?.includes(req.user.uid);
    const esCreadorCompetencia = competencia.creadoPor?.toString() === req.user.uid;
    const esCreadorTemporada = temporada.creadoPor?.toString() === req.user.uid;

    const tienePermiso = esAdminGlobal ||
      esAdminCompetencia ||
      esAdminTemporada ||
      esCreadorCompetencia ||
      esCreadorTemporada;

    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para modificar esta temporada' });
    }

    req.temporada = temporada;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error en validación de permisos' });
  }
}

// Actualizar temporada
/**
 * @swagger
 * /api/temporadas/{id}:
 *   put:
 *     summary: Actualiza una temporada
 *     tags: [Temporadas]
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
 *             $ref: '#/components/schemas/Temporada'
 *     responses:
 *       200:
 *         description: Temporada actualizada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  cargarTemporadaYValidarAdmin,
  async (req, res) => {
    try {
      Object.assign(req.temporada, req.body);
      const actualizada = await req.temporada.save();
      res.json(actualizada);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Error al actualizar temporada' });
    }
  }
);

// Eliminar temporada
/**
 * @swagger
 * /api/temporadas/{id}:
 *   delete:
 *     summary: Elimina una temporada
 *     tags: [Temporadas]
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
 *         description: Temporada eliminada correctamente
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  cargarTemporadaYValidarAdmin,
  async (req, res) => {
    try {
      await req.temporada.deleteOne();
      res.json({ mensaje: 'Temporada eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: 'Error al eliminar temporada' });
    }
  }
);

export default router;
