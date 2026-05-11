// routes/Organizaciones/miembrosOrganizacion.js
import express from 'express';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../../middleware/esAdminDeEntidad.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import Organizacion from '../../models/Organizacion.js';
import MiembroOrganizacion from '../../models/Organizacion/MiembroOrganizacion.js';
import Usuario from '../../models/Usuario.js';
import { hasOrgPermission } from '../../services/orgPermissionService.js';
import { verificarEntidad } from '../../middleware/verificarEntidad.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Miembros Organización
 *   description: Gestión de miembros de organizaciones
 */

// Agregar miembro a organización
/**
 * @swagger
 * /api/organizaciones/{id}/miembros:
 *   post:
 *     summary: Agrega un miembro a una organización
 *     tags: [Miembros Organización]
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
 *             required: [usuarioId, rol]
 *             properties:
 *               usuarioId:
 *                 type: string
 *               rol:
 *                 type: string
 *                 enum: [presidente, secretario, tesorero, delegado, arbitro, coordinador, staff]
 *               permisos:
 *                 type: array
 *                 items:
 *                   type: string
 *               notas:
 *                 type: string
 *     responses:
 *       201:
 *         description: Miembro agregado
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
  '/:id/miembros',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const organizacionId = req.params.id;
      const usuarioId = req.user.uid;
      const rolGlobal = req.user.rol;
      const { usuarioId: targetUserId, rol, permisos, notas } = req.body;

      // Verificar permisos para gestionar miembros
      const canManageMembers = await hasOrgPermission({
        organizacionId,
        usuarioId,
        rolGlobal,
        permission: 'members.manage',
      });

      if (!canManageMembers) {
        return res.status(403).json({ message: 'No tienes permisos para gestionar miembros de esta organización' });
      }

      // Verificar que el usuario exista
      const usuario = await Usuario.findById(targetUserId);
      if (!usuario) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      // Verificar que no sea ya miembro
      const miembroExistente = await MiembroOrganizacion.findOne({
        organizacion: organizacionId,
        usuarioId: targetUserId,
      });

      if (miembroExistente) {
        return res.status(400).json({ message: 'El usuario ya es miembro de esta organización' });
      }

      const nuevoMiembro = new MiembroOrganizacion({
        organizacion: organizacionId,
        usuarioId: targetUserId,
        rol,
        permisos: permisos || [],
        notas,
        creadoPor: usuarioId,
      });

      await nuevoMiembro.save();
      await nuevoMiembro.populate('usuarioId', 'nombre email');
      
      res.status(201).json(nuevoMiembro);
    } catch (error) {
      console.error('Error al agregar miembro a organización:', error);
      res.status(500).json({ message: 'Error al agregar miembro a la organización', error: error.message });
    }
  }
);

// Listar miembros de una organización
/**
 * @swagger
 * /api/organizaciones/{id}/miembros:
 *   get:
 *     summary: Lista miembros de una organización
 *     tags: [Miembros Organización]
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
 *         description: Lista de miembros
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:id/miembros',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const organizacionId = req.params.id;
      const usuarioId = req.user.uid;
      const rolGlobal = req.user.rol;

      // Verificar permisos para ver miembros
      const canViewPrivate = await hasOrgPermission({
        organizacionId,
        usuarioId,
        rolGlobal,
        permission: 'org.view_private',
      });

      if (!canViewPrivate) {
        return res.status(403).json({ message: 'No tienes permisos para ver miembros de esta organización' });
      }

      const miembros = await MiembroOrganizacion.find({ organizacion: organizacionId })
        .populate('usuarioId', 'nombre email')
        .populate('creadoPor', 'nombre email')
        .sort({ createdAt: -1 });

      res.json(miembros);
    } catch (error) {
      console.error('Error al listar miembros de organización:', error);
      res.status(500).json({ message: 'Error al listar miembros de la organización', error: error.message });
    }
  }
);

// Actualizar miembro de organización
/**
 * @swagger
 * /api/organizaciones/{id}/miembros/{miembroId}:
 *   put:
 *     summary: Actualiza un miembro de una organización
 *     tags: [Miembros Organización]
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
 *         name: miembroId
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
 *               rol:
 *                 type: string
 *                 enum: [presidente, secretario, tesorero, delegado, arbitro, coordinador, staff]
 *               permisos:
 *                 type: array
 *                 items:
 *                   type: string
 *               estado:
 *                 type: string
 *                 enum: [activo, suspendido, inactivo]
 *               notas:
 *                 type: string
 *     responses:
 *       200:
 *         description: Miembro actualizado
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
  '/:id/miembros/:miembroId',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const organizacionId = req.params.id;
      const miembroId = req.params.miembroId;
      const usuarioId = req.user.uid;
      const rolGlobal = req.user.rol;
      const { rol, permisos, estado, notas } = req.body;

      // Verificar permisos para gestionar miembros
      const canManageMembers = await hasOrgPermission({
        organizacionId,
        usuarioId,
        rolGlobal,
        permission: 'members.manage',
      });

      if (!canManageMembers) {
        return res.status(403).json({ message: 'No tienes permisos para gestionar miembros de esta organización' });
      }

      const miembro = await MiembroOrganizacion.findOne({
        _id: miembroId,
        organizacion: organizacionId,
      });

      if (!miembro) {
        return res.status(404).json({ message: 'Miembro no encontrado' });
      }

      // Actualizar campos permitidos
      if (rol !== undefined) miembro.rol = rol;
      if (permisos !== undefined) miembro.permisos = permisos;
      if (estado !== undefined) miembro.estado = estado;
      if (notas !== undefined) miembro.notas = notas;

      await miembro.save();
      await miembro.populate('usuarioId', 'nombre email');
      await miembro.populate('creadoPor', 'nombre email');

      res.json(miembro);
    } catch (error) {
      console.error('Error al actualizar miembro de organización:', error);
      res.status(500).json({ message: 'Error al actualizar miembro de la organización', error: error.message });
    }
  }
);

// Eliminar miembro de organización
/**
 * @swagger
 * /api/organizaciones/{id}/miembros/{miembroId}:
 *   delete:
 *     summary: Elimina un miembro de una organización
 *     tags: [Miembros Organización]
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
 *         name: miembroId
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Miembro eliminado
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  '/:id/miembros/:miembroId',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const organizacionId = req.params.id;
      const miembroId = req.params.miembroId;
      const usuarioId = req.user.uid;
      const rolGlobal = req.user.rol;

      // Verificar permisos para gestionar miembros
      const canManageMembers = await hasOrgPermission({
        organizacionId,
        usuarioId,
        rolGlobal,
        permission: 'members.manage',
      });

      if (!canManageMembers) {
        return res.status(403).json({ message: 'No tienes permisos para gestionar miembros de esta organización' });
      }

      const miembro = await MiembroOrganizacion.findOne({
        _id: miembroId,
        organizacion: organizacionId,
      });

      if (!miembro) {
        return res.status(404).json({ message: 'Miembro no encontrado' });
      }

      await MiembroOrganizacion.deleteOne({ _id: miembroId });

      res.json({ message: 'Miembro eliminado correctamente' });
    } catch (error) {
      console.error('Error al eliminar miembro de organización:', error);
      res.status(500).json({ message: 'Error al eliminar miembro de la organización', error: error.message });
    }
  }
);

export default router;
