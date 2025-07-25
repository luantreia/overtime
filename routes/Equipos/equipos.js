// routes/equipo.js
import express from 'express';
import mongoose from 'mongoose';
import Equipo from '../../models/Equipo/Equipo.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { esAdminDeEntidad } from '../../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { verificarEntidad } from '../../middlewares/verificarEntidad.js';
import Usuario from '../../models/Usuario.js';

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

// GET /equipos/admin - equipos que el usuario puede administrar
router.get('/admin', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    let equipos;

    if (rol === 'admin') {
      equipos = await Equipo.find({}, 'nombre _id').lean();
    } else {
      equipos = await Equipo.find({
        $or: [
          { creadoPor: uid },
          { administradores: uid }
        ]
      }, 'nombre _id').lean();
    }

    res.status(200).json(equipos);
  } catch (error) {
    console.error('Error al obtener equipos administrables:', error);
    res.status(500).json({ message: 'Error al obtener equipos administrables' });
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
    const equipo = await Equipo.findById(id)
      .populate('administradores', 'email nombre'); // <--- esta línea es clave

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
  const datosActualizar = { ...req.body };

  // Limpieza de campos vacíos y tipos
  if ('colores' in datosActualizar && Array.isArray(datosActualizar.colores)) {
    datosActualizar.colores = datosActualizar.colores.filter(c => c);
  }
  if ('federacion' in datosActualizar && (!datosActualizar.federacion || datosActualizar.federacion === '')) {
    datosActualizar.federacion = null;
  }
  if ('pais' in datosActualizar && datosActualizar.pais === undefined) {
    datosActualizar.pais = '';
  }
  if ('escudo' in datosActualizar && typeof datosActualizar.escudo !== 'string') {
    datosActualizar.escudo = '';
  }
  if ('tipo' in datosActualizar && !datosActualizar.tipo) {
    datosActualizar.tipo = 'club';
  }
  if ('descripcion' in datosActualizar && !datosActualizar.descripcion) {
    datosActualizar.descripcion = '';
  }
  if ('sitioWeb' in datosActualizar && !datosActualizar.sitioWeb) {
    datosActualizar.sitioWeb = '';
  }
  if ('esSeleccionNacional' in datosActualizar) {
    datosActualizar.esSeleccionNacional = !!datosActualizar.esSeleccionNacional;
  }

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

router.get('/:id/administradores', verificarEntidad(Equipo, 'id', 'equipo'), async (req, res) => {
  try {
    await req.equipo.populate('administradores', 'email nombre').execPopulate();
    res.status(200).json(req.equipo.administradores);
  } catch (error) {
    console.error('Error al obtener administradores:', error);
    res.status(500).json({ message: 'Error al obtener administradores' });
  }
});

router.post('/:id/administradores', verificarToken, cargarRolDesdeBD, verificarEntidad(Equipo, 'id', 'equipo'), async (req, res) => {
  try {
    const uid = req.user.uid;
    const equipo = req.equipo;
    const { adminUid, email } = req.body;

    if (!adminUid && !email) {
      return res.status(400).json({ message: 'Se requiere adminUid o email' });
    }

    let usuarioAdminId = adminUid;

    // Buscar UID a partir del email si no se pasó adminUid
    if (email && !adminUid) {
      const usuario = await Usuario.findOne({ email });
      if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
      usuarioAdminId = usuario._id.toString();
    }

    const esAdmin =
      equipo.creadoPor?.toString() === uid ||
      (equipo.administradores || []).some((a) => a.toString() === uid);

    if (!esAdmin && req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No autorizado para modificar administradores' });
    }

    if (!equipo.administradores.includes(usuarioAdminId)) {
      equipo.administradores.push(usuarioAdminId);
      await equipo.save();
    }

    await equipo.populate('administradores', 'email nombre');

    return res.status(200).json({ administradores: equipo.administradores });
  } catch (error) {
    console.error('Error al agregar administrador:', error);
    res.status(500).json({ message: 'Error al agregar administrador' });
  }
});

router.delete('/:id/administradores/:adminUid', verificarToken, cargarRolDesdeBD, verificarEntidad(Equipo, 'id', 'equipo'), async (req, res) => {
  try {
    const uid = req.user.uid;
    const equipo = req.equipo;
    const { adminUid } = req.params;

    const esAdmin = equipo.creadoPor?.toString() === uid || (equipo.administradores || []).some(a => a.toString() === uid);
    if (!esAdmin && req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No autorizado para modificar administradores' });
    }

    equipo.administradores = (equipo.administradores || []).filter(a => a.toString() !== adminUid);
    await equipo.save();

    await equipo.populate('administradores', 'email nombre');
    res.status(200).json({ administradores: equipo.administradores });
  } catch (error) {
    console.error('Error al quitar administrador:', error);
    res.status(500).json({ message: 'Error al quitar administrador' });
  }
});



export default router;

