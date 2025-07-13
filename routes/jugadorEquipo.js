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
// Admin de equipo en la relación o jugador solicitante puede modificar
async function esAdminEquipoOJugadorSolicitante(req, res, next) {
  const { id } = req.params;
  const usuarioId = req.user.uid;
  const usuarioRol = req.user.rol;

  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'ID inválido' });

  const relacion = await JugadorEquipo.findById(id);
  if (!relacion) return res.status(404).json({ message: 'Relación no encontrada' });

  // Cargar equipo y jugador para verificar admin y dueño
  const equipo = await Equipo.findById(relacion.equipo);
  if (!equipo) return res.status(404).json({ message: 'Equipo no encontrado' });

  // Verifico si usuario es admin equipo
  const esAdminEquipo =
    equipo.creadoPor.toString() === usuarioId ||
    equipo.administradores.some(adminId => adminId.toString() === usuarioId) ||
    usuarioRol === 'admin';

  // Verifico si usuario es el que solicitó la relación
  const esSolicitante = relacion.solicitadoPor === usuarioId;

  if (!esAdminEquipo && !esSolicitante) {
    return res.status(403).json({ message: 'No tienes permisos para modificar esta relación' });
  }

  // Puedo pasar la relacion para no buscarla otra vez
  req.relacion = relacion;
  next();
}

async function fueSolicitudHechaPorEquipo(relacion) {
    const equipo = await Equipo.findById(relacion.equipo);
    const jugador = await Jugador.findById(relacion.jugador);

    const esAdminEquipoSolicitante =
      equipo?.creadoPor.toString() === relacion.solicitadoPor ||
      (equipo?.administradores || []).some(aid => aid.toString() === relacion.solicitadoPor);

    const esAdminJugadorSolicitante =
      jugador?.creadoPor.toString() === relacion.solicitadoPor ||
      (jugador?.administradores || []).some(aid => aid.toString() === relacion.solicitadoPor);

    if (esAdminEquipoSolicitante) return true;
    if (esAdminJugadorSolicitante) return false;
    return true; // por defecto asumimos equipo
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

// --- Crear solicitud desde equipo (requiere admin equipo) ---
router.post('/solicitar-equipo', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { jugador, equipo } = req.body;
    const usuarioId = req.user.uid;

    if (!jugador || !equipo) return res.status(400).json({ message: 'Jugador y equipo requeridos' });

    if (!Types.ObjectId.isValid(jugador) || !Types.ObjectId.isValid(equipo)) {
      return res.status(400).json({ message: 'IDs inválidos' });
    }

    const equipoDB = await Equipo.findById(equipo);
    if (!equipoDB) return res.status(404).json({ message: 'Equipo no encontrado' });

    // Verifico permisos admin equipo
    const esAdminEquipo =
      equipoDB.creadoPor.toString() === usuarioId ||
      equipoDB.administradores.some(aid => aid.toString() === usuarioId) ||
      req.user.rol === 'admin';

    if (!esAdminEquipo) return res.status(403).json({ message: 'No autorizado para solicitar por este equipo' });

    const jugadorDB = await Jugador.findById(jugador);
    if (!jugadorDB) return res.status(404).json({ message: 'Jugador no encontrado' });

    // Crear solicitud pendiente
    const solicitud = new JugadorEquipo({
      jugador,
      equipo,
      estado: 'pendiente',
      activo: false,
      creadoPor: usuarioId,
      solicitadoPor: usuarioId,
    });

    await solicitud.save();

    res.status(201).json(solicitud);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});

// --- Crear solicitud desde jugador (requiere admin jugador) ---
router.post('/solicitar-jugador', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { jugador, equipo } = req.body;
    const usuarioId = req.user.uid;

    if (!jugador || !equipo) return res.status(400).json({ message: 'Jugador y equipo requeridos' });

    if (!Types.ObjectId.isValid(jugador) || !Types.ObjectId.isValid(equipo)) {
      return res.status(400).json({ message: 'IDs inválidos' });
    }

    const jugadorDB = await Jugador.findById(jugador);
    if (!jugadorDB) return res.status(404).json({ message: 'Jugador no encontrado' });

    // Verifico que usuario sea admin jugador
    const esAdminJugador =
      jugadorDB.creadoPor.toString() === usuarioId ||
      jugadorDB.administradores.some(aid => aid.toString() === usuarioId) ||
      req.user.rol === 'admin';

    if (!esAdminJugador) return res.status(403).json({ message: 'No autorizado para solicitar por este jugador' });

    const equipoDB = await Equipo.findById(equipo);
    if (!equipoDB) return res.status(404).json({ message: 'Equipo no encontrado' });

    // Crear solicitud pendiente
    const solicitud = new JugadorEquipo({
      jugador,
      equipo,
      estado: 'pendiente',
      activo: false,
      creadoPor: usuarioId,
      solicitadoPor: usuarioId,
    });

    await solicitud.save();

    res.status(201).json(solicitud);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});

// --- Listar solicitudes (pendientes o filtradas) donde usuario es parte --- 
router.get('/solicitudes', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const usuarioId = req.user.uid;
    const rol = req.user.rol;
    const { estado } = req.query; // opcional

    const filtroEstado = estado ? { estado } : { estado: 'pendiente' };

    // Busco solicitudes donde usuario es admin de equipo o admin jugador o solicitante
    // Para simplificar, busco relaciones donde:
    //  - jugador.administradores o jugador.creadoPor = usuarioId
    //  - o equipo.administradores o equipo.creadoPor = usuarioId
    //  - o solicitadoPor = usuarioId

    // Pero como son referencias ObjectId, usaremos populate y filtro en JS (o con agregación si se quiere optimizar)

    const solicitudes = await JugadorEquipo.find(filtroEstado)
      .populate('jugador', 'nombre alias creadoPor administradores')
      .populate('equipo', 'nombre creadoPor administradores')
      .lean();

    // Filtrar solo las que el usuario puede ver/gestionar:
    const solicitudesFiltradas = solicitudes.filter(s => {
      const esAdminJugador = s.jugador.creadoPor === usuarioId || (s.jugador.administradores || []).some(aid => aid.toString() === usuarioId);
      const esAdminEquipo = s.equipo.creadoPor === usuarioId || (s.equipo.administradores || []).some(aid => aid.toString() === usuarioId);
      const esSolicitante = s.solicitadoPor === usuarioId;
      return esAdminJugador || esAdminEquipo || esSolicitante || rol === 'admin';
    });

    res.status(200).json(solicitudesFiltradas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener solicitudes', error: error.message });
  }
});

// --- Actualizar solicitud: aceptar, rechazar, cancelar --- 
router.put('/:id', verificarToken, cargarRolDesdeBD, esAdminEquipoOJugadorSolicitante, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, motivoRechazo } = req.body;
    const relacion = req.relacion;
    const usuarioId = req.user.uid;
    const rol = req.user.rol;

    const estadosValidos = ['pendiente', 'aceptado', 'rechazado', 'cancelado', 'finalizado'];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    if (relacion.estado !== 'pendiente') {
      return res.status(400).json({ message: 'Sólo se puede modificar solicitudes pendientes' });
    }

    const equipo = await Equipo.findById(relacion.equipo);
    const jugador = await Jugador.findById(relacion.jugador);

    const esAdminEquipoUsuario =
      equipo.creadoPor.toString() === usuarioId ||
      equipo.administradores.some(aid => aid.toString() === usuarioId) ||
      rol === 'admin';

    const esAdminJugadorUsuario =
      jugador.creadoPor.toString() === usuarioId ||
      jugador.administradores.some(aid => aid.toString() === usuarioId) ||
      rol === 'admin';

    const fueSolicitadoPorEquipo = await fueSolicitudHechaPorEquipo(relacion);

    if (fueSolicitadoPorEquipo && !esAdminJugadorUsuario) {
      return res.status(403).json({ message: 'Solo el jugador (o admin jugador) puede aceptar o rechazar esta solicitud' });
    }

    if (!fueSolicitadoPorEquipo && !esAdminEquipoUsuario) {
      return res.status(403).json({ message: 'Solo el equipo (o admin equipo) puede aceptar o rechazar esta solicitud' });
    }

    // Aplicar cambios
    relacion.estado = estado;

    if (estado === 'aceptado') {
      relacion.activo = true;
      relacion.fechaAceptacion = new Date();
    }

    if (estado === 'rechazado' || estado === 'cancelado') {
      relacion.activo = false;
      if (motivoRechazo) relacion.motivoRechazo = motivoRechazo;
    }

    await relacion.save();

    res.status(200).json(relacion);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar solicitud', error: error.message });
  }
});

// --- Eliminar relación (sólo admins equipo o solicitante pueden eliminar) ---
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, esAdminEquipoOJugadorSolicitante, async (req, res) => {
  try {
    const { id } = req.params;

    const eliminada = await JugadorEquipo.findByIdAndDelete(id);
    if (!eliminada) {
      return res.status(404).json({ message: 'Relación no encontrada' });
    }

    res.status(200).json({ message: 'Relación eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar relación', error: error.message });
  }
});

export default router;
