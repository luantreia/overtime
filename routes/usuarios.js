// server/routes/usuarios.js

import express from 'express';
import verificarToken from '../middlewares/authMiddleware.js';
import Usuario from '../models/Usuario.js';
import admin from '../utils/firebaseAdmin.js';

const router = express.Router();

// Crear usuario
router.post('/', verificarToken, async (req, res) => {
  try {
    const { email, rol, nombre } = req.body;
    const firebaseUid = req.user.uid;

    const nuevoUsuario = new Usuario({ email, rol, nombre, _id: firebaseUid });
    await nuevoUsuario.save();

    await admin.auth().setCustomUserClaims(firebaseUid, { rol });
    res.status(201).json({ mensaje: 'Usuario guardado' });
  } catch (error) {
    console.error('Error al guardar usuario:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener datos del usuario autenticado
router.get('/mi-perfil', verificarToken, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.user.uid);

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

// Eliminar usuario autenticado
router.delete('/eliminar', verificarToken, async (req, res) => {
  try {
    const { uid } = req.user;

    // Eliminar en MongoDB
    await Usuario.deleteOne({ firebaseUid: uid });

    // Eliminar en Firebase
    await admin.auth().deleteUser(uid);

    res.json({ mensaje: 'Cuenta eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar cuenta:', error);
    res.status(500).json({ error: 'No se pudo eliminar la cuenta' });
  }
});

// Actualizar perfil del usuario autenticado
router.put('/actualizar', verificarToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const { nombre } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const usuarioActualizado = await Usuario.findOneAndUpdate(
      { firebaseUid: uid },
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


export default router;
