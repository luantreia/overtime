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
// Permite si el usuario es admin del equipo, admin del jugador o solicitante de la solicitud.
async function esAdminEquipoOJugadorSolicitante(req, res, next) {
  const { id } = req.params;
  const usuarioId = req.user.uid;
  const usuarioRol = req.user.rol;

  if (!Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  const relacion = await JugadorEquipo.findById(id);
  if (!relacion) {
    return res.status(404).json({ message: 'Relación no encontrada' });
  }

  const equipo = await Equipo.findById(relacion.equipo);
  if (!equipo) {
    return res.status(404).json({ message: 'Equipo no encontrado' });
  }

  const jugador = await Jugador.findById(relacion.jugador);
  if (!jugador) {
    return res.status(404).json({ message: 'Jugador no encontrado' });
  }

  const esAdminEquipo =
    equipo.creadoPor.toString() === usuarioId ||
    (equipo.administradores || []).some(adminId => adminId.toString() === usuarioId) ||
    usuarioRol === 'admin';

  const esAdminJugador =
    jugador.creadoPor.toString() === usuarioId ||
    (jugador.administradores || []).some(adminId => adminId.toString() === usuarioId) ||
    usuarioRol === 'admin';

  const esSolicitante = relacion.solicitadoPor?.toString() === usuarioId;

  if (!esAdminEquipo && !esAdminJugador && !esSolicitante) {
    return res.status(403).json({ message: 'No tienes permisos para modificar esta relación' });
  }

  req.relacion = relacion;
  next();
}

// --- Determina si la solicitud fue iniciada por el equipo ---
async function fueSolicitudHechaPorEquipo(relacion) {
  const equipo = await Equipo.findById(relacion.equipo);
  const jugador = await Jugador.findById(relacion.jugador);

  const solicitadoPorId = relacion.solicitadoPor?.toString();

  const esAdminEquipoSolicitante =
    equipo?.creadoPor.toString() === solicitadoPorId ||
    (equipo?.administradores || []).some(aid => aid.toString() === solicitadoPorId);

  const esAdminJugadorSolicitante =
    jugador?.creadoPor.toString() === solicitadoPorId ||
    (jugador?.administradores || []).some(aid => aid.toString() === solicitadoPorId);

  if (esAdminEquipoSolicitante) return true;
  if (esAdminJugadorSolicitante) return false;
  // Por defecto, si no se puede determinar, asumimos que fue por equipo
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

    const solicitud = new JugadorEquipo({ jugador, equipo, estado: 'pendiente', activo: false, creadoPor: usuarioId, solicitadoPor: usuarioId, origen: 'equipo', });
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
  
    console.log('➡️ Recibido jugador:', jugador);
    console.log('➡️ Recibido equipo:', equipo);
    console.log('➡️ Usuario ID:', usuarioId);
    console.log('➡️ Recibido body:', req.body);
    console.log('➡️ Usuario ID:', usuarioId);

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

    const solicitud = new JugadorEquipo({ jugador, equipo, estado: 'pendiente', activo: false, creadoPor: usuarioId, solicitadoPor: usuarioId, origen: 'jugador',});
    await solicitud.save();

    res.status(201).json(solicitud);
  } catch (error) {

    console.log('Error al crear solicitud desde jugador:', error);  
    console.error('Error al crear solicitud desde jugador:', error);
    console.error('➡️ Error completo:', error);
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
      const jugadorIdStr = s.jugador.creadoPor.toString();
      const equipoIdStr = s.equipo.creadoPor.toString();
      const usuarioIdStr = usuarioId.toString();

      const esAdminJugador =
        jugadorIdStr === usuarioIdStr ||
        (s.jugador.administradores || []).some(aid => aid.toString() === usuarioIdStr);

      const esAdminEquipo =
        equipoIdStr === usuarioIdStr ||
        (s.equipo.administradores || []).some(aid => aid.toString() === usuarioIdStr);

      const esSolicitante = s.solicitadoPor?.toString() === usuarioIdStr;

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
      relacion.estado = estado;
      await relacion.save();
      return res.status(200).json(relacion);
    }

    if (estado === 'rechazado' || estado === 'cancelado') {
      // Podés guardar motivoRechazo si existe antes de eliminar
      if (motivoRechazo) {
        relacion.motivoRechazo = motivoRechazo;
        await relacion.save();
      }
      // Eliminar la relación
      await JugadorEquipo.findByIdAndDelete(relacion._id);
      return res.status(200).json({ message: 'Solicitud eliminada por rechazo o cancelación' });
    }

    // Para otros estados, si los manejás
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
