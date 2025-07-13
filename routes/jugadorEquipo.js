// routes/jugadorEquipo.js
import express from 'express';
import mongoose from 'mongoose';
import JugadorEquipo from '../models/JugadorEquipo.js';
import verificarToken from '../middlewares/authMiddleware.js';
import Jugador from '../models/Jugador.js';
import Equipo from '../models/Equipo.js';
import Usuario from '../models/Usuario.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();
const { Types } = mongoose;

// --- Middleware para verificar permisos ---
async function esAdminEquipoOJugadorSolicitante(req, res, next) {
  const { id } = req.params;
  const usuarioId = req.user.uid;
  const usuarioRol = req.user.rol;

  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'ID inválido' });

  const relacion = await JugadorEquipo.findById(id);
  if (!relacion) return res.status(404).json({ message: 'Relación no encontrada' });

  const equipo = await Equipo.findById(relacion.equipo);
  if (!equipo) return res.status(404).json({ message: 'Equipo no encontrado' });

  const esAdminEquipo =
    equipo.creadoPor.toString() === usuarioId ||
    equipo.administradores.some(adminId => adminId.toString() === usuarioId) ||
    usuarioRol === 'admin';

  const esSolicitante = relacion.solicitadoPor?.toString() === usuarioId;

  if (!esAdminEquipo && !esSolicitante) {
    return res.status(403).json({ message: 'No tienes permisos para modificar esta relación' });
  }

  req.relacion = relacion;
  next();
}

async function fueSolicitudHechaPorEquipo(relacion) {
  const equipo = await Equipo.findById(relacion.equipo);
  const jugador = await Jugador.findById(relacion.jugador);

  const esAdminEquipoSolicitante =
    equipo?.creadoPor.toString() === relacion.solicitadoPor?.toString() ||
    (equipo?.administradores || []).some(aid => aid.toString() === relacion.solicitadoPor?.toString());

  const esAdminJugadorSolicitante =
    jugador?.creadoPor.toString() === relacion.solicitadoPor?.toString() ||
    (jugador?.administradores || []).some(aid => aid.toString() === relacion.solicitadoPor?.toString());

  if (esAdminEquipoSolicitante) return true;
  if (esAdminJugadorSolicitante) return false;
  return true;
}

// --- Obtener contratos por jugador o equipo ---
router.get('/', verificarToken, async (req, res) => {
  try {
    const { jugador, equipo } = req.query;
    if (!jugador && !equipo) {
      return res.status(400).json({ message: 'Debe indicar jugador o equipo' });
    }

    const filtro = {};
    if (jugador) filtro.jugador = jugador;
    if (equipo) filtro.equipo = equipo;

    const relaciones = await JugadorEquipo.find(filtro)
      .populate('jugador', 'nombre alias')
      .populate('equipo', 'nombre escudo')
      .lean();

    res.status(200).json(relaciones);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener contratos', error: error.message });
  }
});

// --- Crear solicitud desde equipo ---
router.post('/solicitar-equipo', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { jugador, equipo } = req.body;
    const usuarioId = req.user.uid;

    if (!jugador || !equipo || !Types.ObjectId.isValid(jugador) || !Types.ObjectId.isValid(equipo)) {
      return res.status(400).json({ message: 'Jugador y equipo válidos requeridos' });
    }

    const equipoDB = await Equipo.findById(equipo);
    if (!equipoDB) return res.status(404).json({ message: 'Equipo no encontrado' });

    const esAdminEquipo =
      equipoDB.creadoPor.toString() === usuarioId ||
      equipoDB.administradores.some(aid => aid.toString() === usuarioId) ||
      req.user.rol === 'admin';

    if (!esAdminEquipo) return res.status(403).json({ message: 'No autorizado' });

    const jugadorDB = await Jugador.findById(jugador);
    if (!jugadorDB) return res.status(404).json({ message: 'Jugador no encontrado' });

    const existente = await JugadorEquipo.findOne({ jugador, equipo, estado: { $in: ['pendiente', 'aceptado'] } });
    if (existente) return res.status(409).json({ message: 'Ya existe una relación o solicitud activa' });

    const solicitud = new JugadorEquipo({ jugador, equipo, estado: 'pendiente', activo: false, creadoPor: usuarioId, solicitadoPor: usuarioId });
    await solicitud.save();

    res.status(201).json(solicitud);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});

// --- Crear solicitud desde jugador ---
router.post('/solicitar-jugador', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { jugador, equipo } = req.body;
    const usuarioId = req.user.uid;

    if (!jugador || !equipo || !Types.ObjectId.isValid(jugador) || !Types.ObjectId.isValid(equipo)) {
      return res.status(400).json({ message: 'Jugador y equipo válidos requeridos' });
    }

    const jugadorDB = await Jugador.findById(jugador);
    if (!jugadorDB) return res.status(404).json({ message: 'Jugador no encontrado' });

    const esAdminJugador =
      jugadorDB.creadoPor.toString() === usuarioId ||
      jugadorDB.administradores.some(aid => aid.toString() === usuarioId) ||
      req.user.rol === 'admin';

    if (!esAdminJugador) return res.status(403).json({ message: 'No autorizado' });

    const equipoDB = await Equipo.findById(equipo);
    if (!equipoDB) return res.status(404).json({ message: 'Equipo no encontrado' });

    const existente = await JugadorEquipo.findOne({ jugador, equipo, estado: { $in: ['pendiente', 'aceptado'] } });
    if (existente) return res.status(409).json({ message: 'Ya existe una relación o solicitud activa' });

    const solicitud = new JugadorEquipo({ jugador, equipo, estado: 'pendiente', activo: false, creadoPor: usuarioId, solicitadoPor: usuarioId });
    await solicitud.save();

    res.status(201).json(solicitud);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});

// --- Ver solicitudes pendientes del usuario ---
router.get('/solicitudes', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const usuarioId = req.user.uid;
    const rol = req.user.rol;
    const { estado } = req.query;

    const filtroEstado = estado ? { estado } : { estado: 'pendiente' };

    const solicitudes = await JugadorEquipo.find(filtroEstado)
      .populate('jugador', 'nombre alias creadoPor administradores')
      .populate('equipo', 'nombre creadoPor administradores')
      .lean();

    const solicitudesFiltradas = solicitudes.filter(s => {
      const esAdminJugador = s.jugador.creadoPor === usuarioId || (s.jugador.administradores || []).some(aid => aid.toString() === usuarioId);
      const esAdminEquipo = s.equipo.creadoPor === usuarioId || (s.equipo.administradores || []).some(aid => aid.toString() === usuarioId);
      const esSolicitante = s.solicitadoPor?.toString() === usuarioId;
      return esAdminJugador || esAdminEquipo || esSolicitante || rol === 'admin';
    });

    res.status(200).json(solicitudesFiltradas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener solicitudes', error: error.message });
  }
});

// --- Actualizar estado de la solicitud ---
router.put('/:id', verificarToken, cargarRolDesdeBD, esAdminEquipoOJugadorSolicitante, async (req, res) => {
  try {
    const { estado, motivoRechazo } = req.body;
    const relacion = req.relacion;
    const usuarioId = req.user.uid;
    const rol = req.user.rol;

    const estadosValidos = ['pendiente', 'aceptado', 'rechazado', 'cancelado', 'finalizado'];
    if (!estadosValidos.includes(estado)) return res.status(400).json({ message: 'Estado inválido' });
    if (relacion.estado !== 'pendiente') return res.status(400).json({ message: 'Solo solicitudes pendientes pueden modificarse' });

    const equipo = await Equipo.findById(relacion.equipo);
    const jugador = await Jugador.findById(relacion.jugador);

    const esAdminEquipo = equipo.creadoPor.toString() === usuarioId || equipo.administradores.some(a => a.toString() === usuarioId) || rol === 'admin';
    const esAdminJugador = jugador.creadoPor.toString() === usuarioId || jugador.administradores.some(a => a.toString() === usuarioId) || rol === 'admin';

    const fuePorEquipo = await fueSolicitudHechaPorEquipo(relacion);

    if (fuePorEquipo && !esAdminJugador) return res.status(403).json({ message: 'Solo el jugador puede aceptar/rechazar' });
    if (!fuePorEquipo && !esAdminEquipo) return res.status(403).json({ message: 'Solo el equipo puede aceptar/rechazar' });

    if (estado === 'aceptado') {
      const yaActivo = await JugadorEquipo.findOne({ jugador: relacion.jugador, equipo: relacion.equipo, estado: 'aceptado', _id: { $ne: relacion._id } });
      if (yaActivo) return res.status(400).json({ message: 'Ya hay un contrato activo entre este jugador y equipo' });
      relacion.activo = true;
      relacion.fechaAceptacion = new Date();
    }

    if (estado === 'rechazado' || estado === 'cancelado') {
      relacion.activo = false;
      if (motivoRechazo) relacion.motivoRechazo = motivoRechazo;
    }

    relacion.estado = estado;
    await relacion.save();

    res.status(200).json(relacion);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar solicitud', error: error.message });
  }
});

// --- Eliminar solicitud ---
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, esAdminEquipoOJugadorSolicitante, async (req, res) => {
  try {
    const relacion = req.relacion;
    if (relacion.estado === 'aceptado') {
      return res.status(403).json({ message: 'No se puede eliminar un contrato aceptado. Marcar como finalizado en su lugar.' });
    }

    await JugadorEquipo.findByIdAndDelete(relacion._id);
    res.status(200).json({ message: 'Relación eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar relación', error: error.message });
  }
});

export default router;
