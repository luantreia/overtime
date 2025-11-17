import express from 'express';
import Competencia from '../../models/Competencia/Competencia.js';
import verificarToken from '../../middleware/authMiddleware.js';
import Organizacion from '../../models/Organizacion.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../../middleware/esAdminDeEntidad.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import { verificarEntidad } from '../../middleware/verificarEntidad.js';
import Usuario from '../../models/Usuario.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Competencias
 *   description: Gestión de competencias
 */

// Obtener todas las competencias (público)
/**
 * @swagger
 * /api/competencias:
 *   get:
 *     summary: Lista todas las competencias
 *     tags: [Competencias]
 *     responses:
 *       200:
 *         description: Lista de competencias
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Competencia'
 *       500:
 *         description: Error al obtener competencias
 */
router.get('/', 
  async (req, res) => {
  try {
    const competencias = await Competencia.find().populate('organizacion', 'nombre').lean();
    res.json(competencias);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener competencias' });
  }
});

// GET /competencias/admin - competencias que el usuario puede administrar
/**
 * @swagger
 * /api/competencias/admin:
 *   get:
 *     summary: Lista competencias administrables por el usuario
 *     tags: [Competencias]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de competencias
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error del servidor
 */
router.get('/admin', 
  verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    let competencias;

    if (rol === 'admin') {
      competencias = await Competencia.find({}, 'nombre _id tipo estado fechaInicio fechaFin organizacion createdAt updatedAt').populate('organizacion', 'nombre').lean();
    } else {
      competencias = await Competencia.find({
        $or: [
          { creadoPor: uid },
          { administradores: uid }
        ]
      }, 'nombre _id tipo estado fechaInicio fechaFin organizacion createdAt updatedAt').populate('organizacion', 'nombre').lean();
    }

    res.status(200).json(competencias);
  } catch (error) {
    console.error('Error al obtener competencias administrables:', error);
    res.status(500).json({ message: 'Error al obtener competencias administrables' });
  }
});

// Obtener competencia por ID (público)
/**
 * @swagger
 * /api/competencias/{id}:
 *   get:
 *     summary: Obtiene una competencia por ID
 *     tags: [Competencias]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Competencia encontrada (incluye esAdmin si autenticado)
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get( '/:id',
  validarObjectId,
  async (req, res, next) => {
    try {
      const competencia = await Competencia.findById(req.params.id).populate('organizacion', 'nombre').lean();
      if (!competencia) return res.status(404).json({ error: 'Competencia no encontrada' });

      if (!req.user) {
        // usuario no autenticado, devuelve sin esAdmin
        return res.json({ ...competencia, esAdmin: false });
      }

      // para verificar permisos, reutilizás la lógica del middleware:
      const usuarioId = req.user.uid;
      const rolGlobal = req.user.rol;
      const esCreador = competencia.creadoPor?.toString() === usuarioId;
      const esAdminEntidad = competencia.administradores?.some(adminId => adminId.toString() === usuarioId);
      const esAdmin = rolGlobal === 'admin' || esCreador || esAdminEntidad;

      return res.json({ ...competencia, esAdmin });
    } catch (error) {
      next(error);
    }
  }
);

// Crear competencia (solo usuario autenticado)
/**
 * @swagger
 * /api/competencias:
 *   post:
 *     summary: Crea una nueva competencia
 *     tags: [Competencias]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Competencia'
 *     responses:
 *       201:
 *         description: Competencia creada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post( '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { nombre, ...datosCompetencia } = req.body;

      const organizacion = await Organizacion.findById(datosCompetencia.organizacion).lean();

      if (!organizacion) {
        return res.status(404).json({ error: 'Organización no encontrada' });
      }

      const esAdminGlobal = req.user.rol === 'admin';
      const esAdminOrganizacion = organizacion.administradores?.includes(req.user.uid);

      if (!esAdminGlobal && !esAdminOrganizacion) {
        return res.status(403).json({ error: 'No tienes permisos para crear una competencia en esta organización' });
      }

      const nueva = new Competencia({
        ...datosCompetencia,
        creadoPor: req.user.uid,
        administradores: [req.user.uid],
      });

      const guardada = await nueva.save();
      res.status(201).json(guardada);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Error al crear competencia' });
    }
  }
);

// Actualizar competencia (solo admins o creadores)
/**
 * @swagger
 * /api/competencias/{id}:
 *   put:
 *     summary: Actualiza una competencia existente
 *     tags: [Competencias]
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
 *             $ref: '#/components/schemas/Competencia'
 *     responses:
 *       200:
 *         description: Actualizada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put( '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminDeEntidad(Competencia, 'competencia'),
  async (req, res) => {
    try {
      Object.assign(req.competencia, req.body);
      const actualizada = await req.competencia.save();
      res.json(actualizada);
    } catch (error) {
      res.status(400).json({ error: 'Error al actualizar competencia' });
    }
  }
);

/**
 * @swagger
 * /api/competencias/{id}/administradores:
 *   get:
 *     summary: Lista administradores de una competencia
 *     tags: [Competencias]
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
router.get( '/:id/administradores',
  verificarEntidad(Competencia, 'id', 'competencia'),
  async (req, res) => {
    try {
      await req.competencia.populate('administradores', 'email nombre');
      res.status(200).json({ administradores: req.competencia.administradores || [] });
    } catch (error) {
      console.error('Error al obtener administradores:', error);
      res.status(500).json({ message: 'Error al obtener administradores' });
    }
  }
);

/**
 * @swagger
 * /api/competencias/{id}/administradores:
 *   post:
 *     summary: Agrega un administrador a una competencia
 *     tags: [Competencias]
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
router.post( '/:id/administradores',
  verificarToken,
  cargarRolDesdeBD,
  verificarEntidad(Competencia, 'id', 'competencia'),
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const competencia = req.competencia;
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
        competencia.creadoPor?.toString() === uid ||
        (competencia.administradores || []).some((a) => a.toString() === uid);

      if (!esAdmin && req.user.rol !== 'admin') {
        return res.status(403).json({ message: 'No autorizado para modificar administradores' });
      }

      if (!competencia.administradores) {
        competencia.administradores = [];
      }

      if (!competencia.administradores.some((a) => a.toString() === usuarioAdminId)) {
        competencia.administradores.push(usuarioAdminId);
        await competencia.save();
      }

      await competencia.populate('administradores', 'email nombre');

      res.status(200).json({ administradores: competencia.administradores });
    } catch (error) {
      console.error('Error al agregar administrador:', error);
      res.status(500).json({ message: 'Error al agregar administrador' });
    }
  }
);

/**
 * @swagger
 * /api/competencias/{id}/administradores/{adminUid}:
 *   delete:
 *     summary: Quita un administrador de una competencia
 *     tags: [Competencias]
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
router.delete( '/:id/administradores/:adminUid',
  verificarToken,
  cargarRolDesdeBD,
  verificarEntidad(Competencia, 'id', 'competencia'),
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const competencia = req.competencia;
      const { adminUid } = req.params;

      const esAdmin =
        competencia.creadoPor?.toString() === uid ||
        (competencia.administradores || []).some((a) => a.toString() === uid);

      if (!esAdmin && req.user.rol !== 'admin') {
        return res.status(403).json({ message: 'No autorizado para modificar administradores' });
      }

      if (competencia.administradores && competencia.administradores.length > 0) {
        competencia.administradores = competencia.administradores.filter(
          (a) => a.toString() !== adminUid
        );
        await competencia.save();
      }

      await competencia.populate('administradores', 'email nombre');
      res.status(200).json({ administradores: competencia.administradores || [] });
    } catch (error) {
      console.error('Error al quitar administrador:', error);
      res.status(500).json({ message: 'Error al quitar administrador' });
    }
  }
);

// Eliminar competencia (solo admins o creadores)
/**
 * @swagger
 * /api/competencias/{id}:
 *   delete:
 *     summary: Elimina una competencia
 *     tags: [Competencias]
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
  esAdminDeEntidad(Competencia, 'competencia'),
  async (req, res) => {
    try {
      await req.competencia.deleteOne();
      res.json({ mensaje: 'Competencia eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: 'Error al eliminar competencia' });
    }
  }
);

export default router;
