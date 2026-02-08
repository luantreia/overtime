import express from 'express';
import verificarToken from '../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middleware/esAdminDeEntidad.js';
import { validarObjectId } from '../middleware/validacionObjectId.js';
import Organizacion from '../models/Organizacion.js';
import Usuario from '../models/Usuario.js';
import { verificarEntidad } from '../middleware/verificarEntidad.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Organizaciones
 *   description: Gestión de organizaciones
 */

// Crear organización (usuario autenticado)
/**
 * @swagger
 * /api/organizaciones:
 *   post:
 *     summary: Crea una nueva organización
 *     tags: [Organizaciones]
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
 *               descripcion:
 *                 type: string
 *     responses:
 *       201:
 *         description: Organización creada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Organizacion'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { nombre, descripcion, verificada, logo, sitioWeb } = req.body;

      const creadoPor = req.user.uid;
      if (!creadoPor) return res.status(401).json({ error: 'No autenticado.' });
      if (!nombre?.trim()) {
        return res.status(400).json({ error: 'El nombre de la organización es obligatorio.' });
      }
      const nueva = new Organizacion({
        nombre,
        descripcion,
        logo,
        sitioWeb,
        creadoPor,
        administradores: [creadoPor],
        // Solo un administrador del sistema puede crear una organización ya verificada
        verificada: req.user.rol === 'admin' ? (verificada || false) : false
      });
      const guardada = await nueva.save();
      res.status(201).json(guardada);
    } catch (e) {
      res.status(400).json({ message: 'Error al crear organización', error: e.message });
    }
  }
);

// Listar todas las organizaciones (público)
/**
 * @swagger
 * /api/organizaciones:
 *   get:
 *     summary: Lista todas las organizaciones
 *     tags: [Organizaciones]
 *     responses:
 *       200:
 *         description: Lista de organizaciones
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Organizacion'
 *       500:
 *         description: Error del servidor
 */
router.get('/', async (req, res) => {
  try {
    const organizaciones = await Organizacion.find().sort({ nombre: 1 }).lean();
    res.json(organizaciones);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener organizaciones' });
  }
});

// Obtener organizaciones que el usuario puede administrar
/**
 * @swagger
 * /api/organizaciones/admin:
 *   get:
 *     summary: Lista organizaciones administrables por el usuario
 *     tags: [Organizaciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de organizaciones
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error del servidor
 */
router.get('/admin', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    let organizaciones;

    if (rol === 'admin') {
      organizaciones = await Organizacion.find({}, 'nombre _id descripcion activa verificada sitioWeb createdAt updatedAt').lean();
    } else {
      organizaciones = await Organizacion.find({
        $or: [
          { creadoPor: uid },
          { administradores: uid }
        ]
      }, 'nombre _id descripcion activa verificada sitioWeb createdAt updatedAt').lean();
    }

    res.status(200).json(organizaciones);
  } catch (error) {
    console.error('Error al obtener organizaciones administrables:', error);
    res.status(500).json({ message: 'Error al obtener organizaciones administrables' });
  }
});

// Obtener organización por ID (público)
/**
 * @swagger
 * /api/organizaciones/{id}:
 *   get:
 *     summary: Obtiene una organización por ID
 *     tags: [Organizaciones]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Organización obtenida
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get(
  '/:id',
  validarObjectId,
  async (req, res) => {
    try {
      const org = await Organizacion.findById(req.params.id).lean();
      if (!org) return res.status(404).json({ message: 'Organización no encontrada' });
      res.json(org);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener organización' });
    }
  }
);

// Actualizar organización (solo admins o creador)
/**
 * @swagger
 * /api/organizaciones/{id}:
 *   put:
 *     summary: Actualiza una organización
 *     tags: [Organizaciones]
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
 *             $ref: '#/components/schemas/Organizacion'
 *     responses:
 *       200:
 *         description: Organización actualizada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Organizacion, 'organizacion'),
  async (req, res) => {
    try {
      const isSystemAdmin = req.user.rol === 'admin';
      
      const camposPermitidos = (({ nombre, descripcion, logo, sitioWeb, activa, verificada }) => {
        const base = { nombre, descripcion, logo, sitioWeb, activa };
        // Solo permitimos modificar 'verificada' si es administrador del sistema
        if (isSystemAdmin && verificada !== undefined) {
          base.verificada = verificada;
        }
        return base;
      })(req.body);

      Object.assign(req.organizacion, camposPermitidos);
      const orgActualizada = await req.organizacion.save();
      res.json(orgActualizada);
    } catch (error) {
      res.status(400).json({ message: 'Error al actualizar organización', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/organizaciones/{id}/administradores:
 *   get:
 *     summary: Lista administradores de una organización
 *     tags: [Organizaciones]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de administradores
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get(
  '/:id/administradores',
  verificarEntidad(Organizacion, 'id', 'organizacion'),
  async (req, res) => {
    try {
      await req.organizacion.populate('administradores', 'email nombre');
      res.status(200).json({ administradores: req.organizacion.administradores || [] });
    } catch (error) {
      console.error('Error al obtener administradores:', error);
      res.status(500).json({ message: 'Error al obtener administradores' });
    }
  }
);

/**
 * @swagger
 * /api/organizaciones/{id}/administradores:
 *   post:
 *     summary: Agrega un administrador a una organización
 *     tags: [Organizaciones]
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
 *               adminUid:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Administrador agregado
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:id/administradores',
  verificarToken,
  cargarRolDesdeBD,
  verificarEntidad(Organizacion, 'id', 'organizacion'),
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const organizacion = req.organizacion;
      const { adminUid, email } = req.body;

      if (!adminUid && !email) {
        return res.status(400).json({ message: 'Se requiere adminUid o email' });
      }

      let usuarioAdminId = adminUid;

      if (email && !adminUid) {
        const usuario = await Usuario.findOne({ email });
        if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
        usuarioAdminId = usuario._id.toString();
      }

      const esAdmin =
        organizacion.creadoPor?.toString() === uid ||
        (organizacion.administradores || []).some((a) => a.toString() === uid);

      if (!esAdmin && req.user.rol !== 'admin') {
        return res.status(403).json({ message: 'No autorizado para modificar administradores' });
      }

      if (!organizacion.administradores) {
        organizacion.administradores = [];
      }

      if (!organizacion.administradores.some((a) => a.toString() === usuarioAdminId)) {
        organizacion.administradores.push(usuarioAdminId);
        await organizacion.save();
      }

      await organizacion.populate('administradores', 'email nombre');

      res.status(200).json({ administradores: organizacion.administradores });
    } catch (error) {
      console.error('Error al agregar administrador:', error);
      res.status(500).json({ message: 'Error al agregar administrador' });
    }
  }
);

/**
 * @swagger
 * /api/organizaciones/{id}/administradores/{adminUid}:
 *   delete:
 *     summary: Quita un administrador de una organización
 *     tags: [Organizaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: path
 *         name: adminUid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Administrador quitado
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  '/:id/administradores/:adminUid',
  verificarToken,
  cargarRolDesdeBD,
  verificarEntidad(Organizacion, 'id', 'organizacion'),
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const organizacion = req.organizacion;
      const { adminUid } = req.params;

      const esAdmin =
        organizacion.creadoPor?.toString() === uid ||
        (organizacion.administradores || []).some((a) => a.toString() === uid);

      if (!esAdmin && req.user.rol !== 'admin') {
        return res.status(403).json({ message: 'No autorizado para modificar administradores' });
      }

      if (organizacion.administradores && organizacion.administradores.length > 0) {
        organizacion.administradores = organizacion.administradores.filter(
          (a) => a.toString() !== adminUid
        );
        await organizacion.save();
      }

      await organizacion.populate('administradores', 'email nombre');
      res.status(200).json({ administradores: organizacion.administradores || [] });
    } catch (error) {
      console.error('Error al quitar administrador:', error);
      res.status(500).json({ message: 'Error al quitar administrador' });
    }
  }
);

// Eliminar organización (solo admins o creador)
/**
 * @swagger
 * /api/organizaciones/{id}:
 *   delete:
 *     summary: Elimina una organización
 *     tags: [Organizaciones]
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
 *         description: Eliminada correctamente
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Organizacion, 'organizacion'),
  async (req, res) => {
    try {
      await req.organizacion.deleteOne();
      res.json({ message: 'Organización eliminada' });
    } catch (error) {
      res.status(500).json({ message: 'Error al eliminar organización', error: error.message });
    }
  }
);


export default router;
