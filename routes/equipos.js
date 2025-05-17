const express = require('express');
const Equipo = require('../models/Equipo');
const verificarToken = require('../middlewares/authMiddleware');
const verificarRol = require('../middlewares/verificarRol');
const router = express.Router();


// Ruta para crear un nuevo equipo
router.post('/', verificarToken, verificarRol(["admin"]), async (req, res) => {
  const { nombre } = req.body;

  try {
    // Opcional: Validar si ya existe un equipo con ese número
    const existente = await Equipo.findOne({ nombre });
    if (existente) {
      return res.status(400).json({ message: 'Ya existe un equipo con ese nombre' });
    }

    const nuevoEquipo = new Equipo({ nombre, creadoPor: req.user.uid });
    await nuevoEquipo.save();
    res.status(201).json(nuevoEquipo);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear equipo', error: error.message });
  }
});


// Ruta para obtener todos los equipos
router.get('/', async (req, res) => {
  try {
    const equipos = await Equipo.find();
    res.status(200).json(equipos);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
