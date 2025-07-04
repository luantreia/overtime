// routes/equipo.js
import express from 'express';
import mongoose from 'mongoose';
import Equipo from '../models/Equipo.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';

const router = express.Router();
const { Types } = mongoose;

// Crear nuevo equipo
router.post('/', verificarToken, async (req, res) => {
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
      creadoPor: req.user.uid,        // <--- AGREGAR esta línea
      administradores: [req.user.uid],
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

// Actualizar equipo (solo admins de ese equipo)
router.put('/:id', verificarToken, validarObjectId, cargarRolDesdeBD, esAdminDeEntidad(Equipo, 'equipo'), async (req, res) => {
  const { id } = req.params;
  const datosActualizar = req.body;

  if (!datosActualizar.nombre || datosActualizar.nombre.trim() === '') {
    return res.status(400).json({ message: 'El nombre es obligatorio' });
  }

  try {
    const equipoExistente = await Equipo.findOne({ nombre: datosActualizar.nombre.trim(), _id: { $ne: id } });
    if (equipoExistente) {
      return res.status(400).json({ message: 'Ya existe otro equipo con ese nombre' });
    }

    const equipoActualizado = await Equipo.findByIdAndUpdate(
      id,
      datosActualizar,
      { new: true, runValidators: true }
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

// Agregar otro administrador (solo admins actuales del equipo)
router.post('/:id/agregar-admin', verificarToken, validarObjectId, esAdminDeEntidad(Equipo, 'equipo'), async (req, res) => {
  const { nuevoAdminUid } = req.body;
  const equipo = req.equipo;

  if (!nuevoAdminUid) {
    return res.status(400).json({ message: 'Falta el UID del nuevo administrador' });
  }

  if (equipo.administradores.includes(nuevoAdminUid)) {
    return res.status(400).json({ message: 'Ese usuario ya es administrador' });
  }

  equipo.administradores.push(nuevoAdminUid);
  await equipo.save();

  res.status(200).json({ message: 'Nuevo administrador agregado', equipo });
});

export default router;

