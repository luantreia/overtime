import mongoose from 'mongoose';
import Equipo from '../models/Equipo/Equipo.js';
import MiembroEquipo from '../models/Equipo/MiembroEquipo.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';
import EstadisticasJugadorPartido from '../models/Jugador/EstadisticasJugadorPartido.js';
import EstadisticasJugadorPartidoManual from '../models/Jugador/EstadisticasJugadorPartidoManual.js';
import { permissionImplies, mergePermissions } from '../constants/teamPermissions.js';

const { Types } = mongoose;

export async function hasTeamPermission({ equipoId, usuarioId, rolGlobal, permission }) {
  if (!usuarioId || !equipoId || !Types.ObjectId.isValid(equipoId)) return false;
  if ((rolGlobal || '').toLowerCase() === 'admin') return true;

  const equipo = await Equipo.findById(equipoId).select('creadoPor administradores').lean();
  if (!equipo) return false;

  const esCreador = String(equipo.creadoPor || '') === String(usuarioId);
  const esAdminEquipo = (equipo.administradores || []).some((adminId) => String(adminId) === String(usuarioId));

  if (esCreador || esAdminEquipo) return true;

  const miembro = await MiembroEquipo.findOne({
    equipo: equipoId,
    usuarioId: String(usuarioId),
    estado: 'activo',
  }).select('rol permisos').lean();

  if (!miembro) return false;

  const permisos = mergePermissions(miembro.rol, miembro.permisos || []);
  return permissionImplies(permisos, permission);
}

export async function getEquipoIdFromJugadorPartido(jugadorPartidoId) {
  if (!jugadorPartidoId || !Types.ObjectId.isValid(jugadorPartidoId)) return null;
  const jp = await JugadorPartido.findById(jugadorPartidoId).select('equipo').lean();
  return jp?.equipo ? String(jp.equipo) : null;
}

export async function getEquipoIdFromEstadisticaJugadorSet(statId) {
  if (!statId || !Types.ObjectId.isValid(statId)) return null;
  const stat = await EstadisticasJugadorSet.findById(statId).select('equipo').lean();
  return stat?.equipo ? String(stat.equipo) : null;
}

export async function getEquipoIdFromEstadisticaJugadorPartido(statId) {
  if (!statId || !Types.ObjectId.isValid(statId)) return null;
  const stat = await EstadisticasJugadorPartido.findById(statId).select('jugadorPartido').lean();
  if (!stat?.jugadorPartido) return null;
  return getEquipoIdFromJugadorPartido(stat.jugadorPartido);
}

export async function getEquipoIdFromEstadisticaJugadorPartidoManual(statId) {
  if (!statId || !Types.ObjectId.isValid(statId)) return null;
  const stat = await EstadisticasJugadorPartidoManual.findById(statId).select('jugadorPartido').lean();
  if (!stat?.jugadorPartido) return null;
  return getEquipoIdFromJugadorPartido(stat.jugadorPartido);
}
