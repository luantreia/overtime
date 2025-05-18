import express from 'express';
import Equipo from '../models/Equipo.js';
import verificarToken from '../middlewares/authMiddleware.js';
import verificarRol from '../middlewares/verificarRol.js';
import mongoose from 'mongoose';

const router = express.Router();
const { Types } = mongoose;

// Middleware para validar ObjectId en rutas que lo requieran
function validarObjectId(req, res, next) {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'ID de equipo inválido' });
  }
  next();
}

// Crear nuevo equipo
router.post('/', verificarToken, verificarRol(['admin']), async (req, res) => {
  const { nombre, escudo, foto } = req.body;

  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ message: 'El nombre es obligatorio' });
  }

  try {
    const existente = await Equipo.findOne({ nombre: nombre.trim() });
    if (existente) {
      return res.status(400).json({ message: 'Ya existe un equipo con ese nombre' });
    }

    const nuevoEquipo = new Equipo({
      nombre: nombre.trim(),
      escudo,
      foto,
      creadoPor: req.user.uid
    });

    await nuevoEquipo.save();
    res.status(201).json(nuevoEquipo);
  } catch (error) {
    console.error('Error al crear equipo:', error);
    res.status(500).json({ message: 'Error al crear equipo', error: error.message });
  }
});

// Obtener todos los equipos
router.get('/', async (req, res) => {
  try {
    const equipos = await Equipo.find();
    res.status(200).json(equipos);
  } catch (error) {
    console.error('Error al obtener equipos:', error);
    res.status(500).json({ message: 'Error al obtener equipos', error: error.message });
  }
});

// Obtener un equipo por ID
router.get('/:id', validarObjectId, async (req, res) => {
  const { id } = req.params;

  try {
    const equipo = await Equipo.findById(id);
    if (!equipo) {
      return res.status(404).json({ message: 'Equipo no encontrado' });
    }
    res.status(200).json(equipo);
  } catch (error) {
    console.error('Error al obtener equipo:', error);
    res.status(500).json({ message: 'Error al obtener equipo', error: error.message });
  }
});

// Actualizar equipo
router.put('/:id', verificarToken, verificarRol(['admin']), validarObjectId, async (req, res) => {
  const { id } = req.params;
  const { nombre, escudo, foto } = req.body;

  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ message: 'El nombre es obligatorio' });
  }

  try {
    // Opcional: verificar que no haya otro equipo con ese nombre (distinto al actual)
    const equipoExistente = await Equipo.findOne({ nombre: nombre.trim(), _id: { $ne: id } });
    if (equipoExistente) {
      return res.status(400).json({ message: 'Ya existe otro equipo con ese nombre' });
    }

    const equipoActualizado = await Equipo.findByIdAndUpdate(
      id,
      { nombre: nombre.trim(), escudo, foto },
      { new: true }
    );

    if (!equipoActualizado) {
      return res.status(404).json({ message: 'Equipo no encontrado' });
    }

    res.status(200).json(equipoActualizado);
  } catch (error) {
    console.error('Error al actualizar equipo:', error);
    res.status(500).json({ message: 'Error al actualizar equipo', error: error.message });
  }
});

export default router;
