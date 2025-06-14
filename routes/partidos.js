import express from 'express';
import Partido from '../models/Partido.js';

const router = express.Router();

// Crear partido
router.post('/', async (req, res) => {
  try {
    const { liga, modalidad, categoria, fecha, equipos } = req.body;
    const nuevoPartido = new Partido({ liga, modalidad, categoria, fecha, equipos });
    await nuevoPartido.save();
    res.status(201).json(nuevoPartido);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Listar partidos
router.get('/', async (req, res) => {
  try {
    const partidos = await Partido.find().lean(); // lean para mejor performance
    res.json(partidos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
