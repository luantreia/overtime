//./server/routes/jugadores.js
const express = require('express');
const Jugador = require('../models/Jugador');
const Equipo = require('../models/Equipo');
const { Types } = require('mongoose');
const router = express.Router();


// Crear nuevo jugador
router.post('/', async (req, res) => {
  let { nombre, posicion, equipoId, edad, foto } = req.body;

  try {
    // Si equipoId no es un ObjectId válido, buscar por otro campo
    if (!Types.ObjectId.isValid(equipoId)) {
      // Intentar buscar por el campo "numero" si estás enviando un número como "1"
      const equipo = await Equipo.findOne({ numero: parseInt(equipoId) });

      if (!equipo) {
        return res.status(400).json({ message: 'Equipo no encontrado con ID o número proporcionado' });
      }

      equipoId = equipo._id; // Usar el ObjectId real
    }

    const jugador = new Jugador({
      nombre,
      posicion: Array.isArray(posicion) ? posicion : [posicion],
      equipoId,
      edad,
      foto
    });

    await jugador.save();
    res.status(201).json(jugador);
  } catch (error) {
    console.error('Error al guardar jugador:', error);
    res.status(400).json({ message: 'Error al guardar jugador', error: error.message });
  }
});

// Ruta para obtener todos los jugadores
router.get('/', async (req, res) => {
  try {
    const jugadores = await Jugador.find().populate('equipoId');
    res.status(200).json(jugadores);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
