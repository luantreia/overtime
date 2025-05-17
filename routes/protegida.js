// routes/protegida.js
const express = require("express");
const router = express.Router();
const verificarToken = require("../middlewares/auth");
const Usuario = require("../models/Usuario");

router.get("/solo-editores", verificarToken, async (req, res) => {
  const uid = req.user.uid;

  const usuario = await Usuario.findOne({ firebaseUid: uid });
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

  if (usuario.rol !== "editor") {
    return res.status(403).json({ error: "Acceso denegado" });
  }

  res.json({ mensaje: "Contenido para editores" });
});

module.exports = router;
