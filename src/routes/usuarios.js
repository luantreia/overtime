// server/routes/usuarios.js

import express from 'express';
import verificarToken from '../middleware/authMiddleware.js';
import Usuario from '../models/Usuario.js';

/**
 * @swagger
 * tags:
 *   name: Usuarios
 *   description: Gestión de usuarios (perfil autenticado y utilidades)
 */


const router = express.Router();

// Crear usuario (deprecado en modo JWT-only)
/**
 * @swagger
 * /api/usuarios:
 *   post:
 *     summary: [DEPRECADO] Crear usuario
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     deprecated: true
 *     responses:
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post('/', verificarToken, async (req, res) => {
  return res.status(400).json({ error: 'Usar /api/auth/registro para crear usuarios (JWT)' });
});

// Obtener datos del usuario autenticado
/**
 * @swagger
 * /api/usuarios/mi-perfil:
 *   get:
 *     summary: Obtiene el perfil del usuario autenticado
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/mi-perfil', verificarToken, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.user.id);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      nombre: usuario.nombre || '',
      email: usuario.email,
      rol: usuario.rol,
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: error.message });
  }
});

// Buscar usuario por email (para gestión de administradores)
/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Busca un usuario por email
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/', verificarToken, async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email requerido' });
    }

    const usuario = await Usuario.findOne({ email });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
    });
  } catch (error) {
    console.error('Error al buscar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener usuario por ID
/**
 * @swagger
 * /api/usuarios/{id}:
 *   get:
 *     summary: Obtiene un usuario por ID
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await Usuario.findOne({ $or: [{ _id: id }, { id: id }] });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar perfil del usuario autenticado
/**
 * @swagger
 * /api/usuarios/actualizar:
 *   put:
 *     summary: Actualiza el perfil del usuario autenticado
 *     tags: [Usuarios]
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
 *     responses:
 *       200:
 *         description: Perfil actualizado
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/actualizar', verificarToken, async (req, res) => {
  try {
    const { id } = req.user;
    const { nombre } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const usuarioActualizado = await Usuario.findOneAndUpdate(
      { _id: id },
      { nombre },
      { new: true }
    );

    if (!usuarioActualizado) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      mensaje: 'Perfil actualizado',
      nombre: usuarioActualizado.nombre,
      email: usuarioActualizado.email,
      rol: usuarioActualizado.rol,
    });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'No se pudo actualizar el perfil' });
  }
});

// Eliminar usuario autenticado
/**
 * @swagger
 * /api/usuarios/eliminar:
 *   delete:
 *     summary: Elimina la cuenta del usuario autenticado
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cuenta eliminada correctamente
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete('/eliminar', verificarToken, async (req, res) => {
  try {
    const { id } = req.user;

    // Eliminar en MongoDB
    await Usuario.deleteOne({ _id: id });

    res.json({ mensaje: 'Cuenta eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar cuenta:', error);
    res.status(500).json({ error: 'No se pudo eliminar la cuenta' });
  }
});


export default router;
