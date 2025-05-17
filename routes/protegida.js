// routes/protegida.js
import express from 'express';
import verificarToken from '../middlewares/authMiddleware.js';
import Usuario from '../models/Usuario.js';

const router = express.Router();

router.get("/solo-editores", verificarToken, async (req, res) => {
  const uid = req.user.uid;

  const usuario = await Usuario.findOne({ firebaseUid: uid });
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

  if (usuario.rol !== "editor") {
    return res.status(403).json({ error: "Acceso denegado" });
  }

  res.json({ mensaje: "Contenido para editores" });
});

export default router;

