const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/authMiddleware');
const Usuario = require('../models/Usuario');

router.post('/', verificarToken, async (req, res) => {
  try {
    console.log('Body recibido:', req.body);
    console.log('UID del usuario:', req.user.uid);

    const { email, rol } = req.body;
    const firebaseUid = req.user.uid;

    const nuevoUsuario = new Usuario({ email, rol, firebaseUid });
    await nuevoUsuario.save();

    res.status(201).json({ mensaje: 'Usuario guardado' });
  } catch (error) {
    console.error('Error al guardar usuario:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/mi-perfil', verificarToken, async (req, res) => {
  const uid = req.user.uid;
  const usuario = await Usuario.findOne({ firebaseUid: uid });

  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json({ email: usuario.email, rol: usuario.rol });
});


module.exports = router;

