import express from 'express';
import { Jugador } from '../../models/Jugador/Jugador.js';
import JugadorEquipo from '../../models/Jugador/JugadorEquipo.js';
import mongoose from 'mongoose';
import { esAdminDeEntidad } from '../../middlewares/esAdminDeEntidad.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { verificarEntidad } from '../../middlewares/verificarEntidad.js';
import Usuario from '../../models/Usuario.js';

const { Types } = mongoose;
const router = express.Router();


// Crear nuevo jugador
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre, alias, fechaNacimiento, genero, foto } = req.body;
    if (!nombre || !fechaNacimiento) {
      return res.status(400).json({ message: 'Nombre y fechaNacimiento son obligatorios' });
    }

    const jugador = new Jugador({
      nombre,
      alias,
      fechaNacimiento,
      genero,
      foto,
      creadoPor: req.user.uid,  // <- asigna creador aquí
      administradores: [req.user.uid] // opcional: asignar creador como admin inicial
    });

    await jugador.save();
    res.status(201).json(jugador);
  } catch (error) {
    console.error('Error al guardar jugador:', error);
    res.status(400).json({ message: 'Error al guardar jugador', error: error.message });
  }
});

// GET /jugadores/admin - jugadores que el usuario puede administrar
router.get('/admin', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    let jugadores;

    if (rol === 'admin') {
      jugadores = await Jugador.find({}, 'nombre _id').lean();
    } else {
      jugadores = await Jugador.find({
        $or: [
          { creadoPor: uid },
          { administradores: uid }
        ]
      }, 'nombre _id').lean();
    }

    res.status(200).json(jugadores);
  } catch (error) {
    console.error('Error al obtener jugadores administrables:', error);
    res.status(500).json({ message: 'Error al obtener jugadores administrables' });
  }
});


// GET /jugadores -> todos los jugadores, sin filtro por equipo
router.get('/', async (req, res) => {
  try {
    const jugadores = await Jugador.find();
    res.status(200).json(jugadores);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


router.get('/por-equipo/:equipoId', async (req, res) => {
  const { equipoId } = req.params;

  if (!equipoId || !mongoose.Types.ObjectId.isValid(equipoId)) {
    return res.status(400).json({ message: 'ID de equipo inválido' });
  }

  try {
    const relaciones = await JugadorEquipo.find({ equipoId, activo: true }) // o sin `activo` si no lo usás
      .populate('jugador', 'nombre alias foto');

    const jugadores = relaciones.map(rel => rel.jugador);

    res.status(200).json(jugadores);
  } catch (error) {
    console.error('Error al obtener jugadores por equipo:', error);
    res.status(500).json({ message: 'Error al obtener jugadores por equipo', error: error.message });
  }
});

// Obtener jugador por ID
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const jugador = await Jugador.findById(req.params.id)
      .populate('administradores', 'email nombre') // opcional: trae info de admins
      .lean();

    if (!jugador) {
      return res.status(404).json({ message: 'Jugador no encontrado' });
    }

    // También podés poblar otras relaciones si lo necesitás
    res.status(200).json(jugador);
  } catch (error) {
    console.error('Error al obtener jugador:', error);
    res.status(500).json({ message: 'Error al obtener jugador' });
  }
});

router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, esAdminDeEntidad(Jugador, 'jugador'), async (req, res) => {
  try {
    const jugador = req.jugador; // ya validado por middleware
    const {
      nombre,
      alias,
      fechaNacimiento,
      genero,
      foto,
      nacionalidad,
      administradores // opcional, si quieres permitir actualizar admins
    } = req.body;

    if (nombre !== undefined) jugador.nombre = nombre;
    if (alias !== undefined) jugador.alias = alias;
    if (fechaNacimiento !== undefined) jugador.fechaNacimiento = fechaNacimiento;
    if (genero !== undefined) jugador.genero = genero;
    if (foto !== undefined) jugador.foto = foto;
    if (nacionalidad !== undefined) jugador.nacionalidad = nacionalidad;
    if (administradores !== undefined && Array.isArray(administradores)) jugador.administradores = administradores;

    await jugador.save();
    res.status(200).json(jugador);
  } catch (error) {
    console.error('Error al actualizar jugador:', error);
    res.status(500).json({ message: 'Error al actualizar jugador', error: error.message });
  }
});

router.get('/:id/administradores', verificarEntidad(Jugador, 'id', 'jugador'), async (req, res) => {
  try {
    await req.jugador.populate('administradores', 'email nombre').execPopulate();
    res.status(200).json(req.jugador.administradores);
  } catch (error) {
    console.error('Error al obtener administradores:', error);
    res.status(500).json({ message: 'Error al obtener administradores' });
  }
});

router.post('/:id/administradores', verificarToken, cargarRolDesdeBD, verificarEntidad(Jugador, 'id', 'jugador'), async (req, res) => {
  try {
    const uid = req.user.uid;
    const jugador = req.jugador;
    const { adminUid, email } = req.body;

    if (!adminUid && !email) {
      return res.status(400).json({ message: 'Se requiere adminUid o email' });
    }

    let usuarioAdminId = adminUid;

    // Si mandan un email, buscamos el UID correspondiente
    if (email && !adminUid) {
      const usuario = await Usuario.findOne({ email });
      if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
      usuarioAdminId = usuario._id.toString();
    }

    const esAdmin =
      jugador.creadoPor?.toString() === uid ||
      (jugador.administradores || []).some((a) => a.toString() === uid);

    if (!esAdmin && req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No autorizado para modificar administradores' });
    }

    if (!jugador.administradores.includes(usuarioAdminId)) {
      jugador.administradores.push(usuarioAdminId);
      await jugador.save();
    }

    await jugador.populate('administradores', 'email nombre');
    res.status(200).json({ administradores: jugador.administradores });
  } catch (error) {
    console.error('Error al agregar administrador:', error);
    res.status(500).json({ message: 'Error al agregar administrador' });
  }
});

router.delete('/:id/administradores/:adminUid', verificarToken, cargarRolDesdeBD, verificarEntidad(Jugador, 'id', 'jugador'), async (req, res) => {
  try {
    const uid = req.user.uid;
    const jugador = req.jugador;
    const { adminUid } = req.params;

    const esAdmin = jugador.creadoPor?.toString() === uid || (jugador.administradores || []).some(a => a.toString() === uid);
    if (!esAdmin && req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No autorizado para modificar administradores' });
    }

    jugador.administradores = (jugador.administradores || []).filter(a => a.toString() !== adminUid);
    await jugador.save();

    await jugador.populate('administradores', 'email nombre');
    res.status(200).json({ administradores: jugador.administradores });
  } catch (error) {
    console.error('Error al quitar administrador:', error);
    res.status(500).json({ message: 'Error al quitar administrador' });
  }
});


// Eliminar jugador por ID
router.delete('/:id', verificarToken, esAdminDeEntidad(Jugador, 'jugador'), async (req, res) => {
  try {
    const jugador = req.jugador; // Cargado por esAdminDeEntidad
    await jugador.deleteOne();   // ✅ Esto dispara el pre('remove')
    res.status(200).json({ message: 'Jugador eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar jugador' });
  }
});


export default router;
