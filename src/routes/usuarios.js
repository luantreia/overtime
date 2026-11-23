// server/routes/usuarios.js

import express from 'express';
import bcrypt from 'bcryptjs';
import verificarToken from '../middleware/authMiddleware.js';
import Usuario from '../models/Usuario.js';
import Jugador from '../models/Jugador/Jugador.js';
import Auditoria from '../models/Auditoria.js';
import { cargarRolDesdeBD } from '../middleware/cargarRolDesdeBD.js';

const ROLES_VALIDOS = ['lector', 'editor', 'admin'];

// Solo el Super Admin. El rol se relee de la BD (cargarRolDesdeBD), no del token.
const soloAdmin = (req, res, next) => {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo un administrador puede hacer esto' });
  }
  next();
};

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
 *     summary: "[DEPRECADO] Crear usuario"
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
      id: usuario._id,
      nombre: usuario.nombre || '',
      email: usuario.email,
      rol: usuario.rol,
      emailVerificado: Boolean(usuario.emailVerificado),
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener todos los usuarios (protegido - solo para admins)
/**
 * @swagger
 * /api/usuarios/admin/lista:
 *   get:
 *     summary: Obtiene lista de todos los usuarios (solo admins)
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Usuario'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/admin/lista', verificarToken, cargarRolDesdeBD, soloAdmin, async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, { passwordHash: 0 });
    
    // Obtener todos los jugadores que tienen un userId vinculado
    const jugadoresReclamados = await Jugador.find({ userId: { $ne: null } }, { userId: 1, nombre: 1 });
    const claimMap = {};
    jugadoresReclamados.forEach(j => {
      claimMap[j.userId] = { _id: j._id, nombre: j.nombre };
    });

    res.json(usuarios.map(u => ({
      _id: u._id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      provider: u.provider,
      perfilVinculado: claimMap[u._id] || null,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    })));
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
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

// Cambiar contraseña del usuario autenticado
router.patch('/password', verificarToken, async (req, res) => {
  try {
    const { id } = req.user;
    const { passwordActual, passwordNueva } = req.body;

    if (!passwordActual || !passwordNueva) {
      return res.status(400).json({ error: 'Se requieren passwordActual y passwordNueva' });
    }
    if (passwordNueva.length < 8 || !/[A-Z]/.test(passwordNueva) || !/[a-z]/.test(passwordNueva) || !/\d/.test(passwordNueva)) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número' });
    }

    const usuario = await Usuario.findById(id).select('+passwordHash');
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const valida = await bcrypt.compare(passwordActual, usuario.passwordHash);
    if (!valida) return res.status(400).json({ error: 'La contraseña actual es incorrecta' });

    usuario.passwordHash = await bcrypt.hash(passwordNueva, 10);
    await usuario.save();

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
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

/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: "[Admin] Edita nombre, email o rol de un usuario"
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               email:
 *                 type: string
 *               rol:
 *                 type: string
 *                 enum: [lector, editor, admin]
 *     responses:
 *       200:
 *         description: Usuario actualizado
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         description: No es administrador
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
// Declarada después de PUT /actualizar para que esa ruta no caiga acá.
router.put('/:id', verificarToken, cargarRolDesdeBD, soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cambios = {};

    if (req.body.nombre !== undefined) {
      const nombre = String(req.body.nombre).trim();
      if (!nombre) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
      cambios.nombre = nombre;
    }
    if (req.body.email !== undefined) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email inválido' });
      }
      cambios.email = email;
    }
    if (req.body.rol !== undefined) {
      const rol = String(req.body.rol).toLowerCase();
      if (!ROLES_VALIDOS.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
      cambios.rol = rol;
    }
    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ error: 'No hay cambios para aplicar' });
    }

    const usuario = await Usuario.findById(id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Nunca dejar la plataforma sin administradores.
    if (usuario.rol === 'admin' && cambios.rol && cambios.rol !== 'admin') {
      const admins = await Usuario.countDocuments({ rol: 'admin' });
      if (admins <= 1) {
        return res.status(400).json({ error: 'No se puede quitar el rol al último administrador' });
      }
    }

    if (cambios.email && cambios.email !== usuario.email) {
      const existe = await Usuario.exists({ email: cambios.email, _id: { $ne: id } });
      if (existe) return res.status(400).json({ error: 'Ese email ya está en uso' });
    }

    const before = { nombre: usuario.nombre, email: usuario.email, rol: usuario.rol };
    Object.assign(usuario, cambios);
    await usuario.save();
    const after = { nombre: usuario.nombre, email: usuario.email, rol: usuario.rol };

    // La auditoría no puede hacer fallar el cambio, pero se intenta siempre.
    try {
      await Auditoria.create({
        usuario: req.user.id,
        entidad: 'Usuario',
        entidadId: usuario._id,
        accion: 'UPDATE',
        cambios: { before, after },
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    } catch (e) {
      console.error('No se pudo registrar la auditoría del cambio de usuario:', e.message);
    }

    res.json({ id: usuario._id, _id: usuario._id, ...after });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
