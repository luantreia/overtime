// server/routes/usuarios.js

import express from 'express';
import verificarToken from '../middlewares/authMiddleware.js';
import Usuario from '../models/Usuario.js';


const router = express.Router();


// Crear usuario (deprecado en modo JWT-only)
router.post('/', verificarToken, async (req, res) => {
  return res.status(400).json({ error: 'Usar /api/auth/registro para crear usuarios (JWT)' });
});

// Obtener datos del usuario autenticado
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
