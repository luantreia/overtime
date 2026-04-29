import Partido from '../models/Partido/Partido.js';
import SetPartido from '../models/Partido/SetPartido.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import SolicitudEdicion from '../models/SolicitudEdicion.js';

const TARGET_VISIBILIDAD = new Set(['organizacion', 'publica']);
const ESTADOS_PUBLICACION_VALIDOS = new Set([
  'privada',
  'pendiente_aprobacion',
  'organizacion',
  'publica',
  'rechazada',
]);
const ROLES_STAFF = new Set(['admin', 'editor']);

export function normalizarVisibilidadObjetivo(valor) {
  if (typeof valor !== 'string') return 'organizacion';
  return TARGET_VISIBILIDAD.has(valor) ? valor : 'organizacion';
}

export function resolverFiltroEstadoPublicacion(rawEstadoPublicacion, rolGlobal, { publico = false } = {}) {
  const esStaff = !publico && ROLES_STAFF.has(rolGlobal);
  const estadosInternosDefault = ['privada', 'pendiente_aprobacion', 'organizacion', 'publica'];

  if (!rawEstadoPublicacion) {
    return {
      ok: true,
      estados: publico ? ['publica'] : (esStaff ? [...ESTADOS_PUBLICACION_VALIDOS] : estadosInternosDefault),
    };
  }

  const estados = String(rawEstadoPublicacion)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  if (!estados.length) {
    return { ok: true, estados: publico ? ['publica'] : (esStaff ? [...ESTADOS_PUBLICACION_VALIDOS] : estadosInternosDefault) };
  }

  const invalidos = estados.filter((estado) => !ESTADOS_PUBLICACION_VALIDOS.has(estado));
  if (invalidos.length) {
    return {
      ok: false,
      status: 400,
      message: `estadoPublicacion inválido: ${invalidos.join(', ')}`,
    };
  }

  if (publico && estados.some((estado) => estado !== 'publica')) {
    return {
      ok: false,
      status: 403,
      message: 'El endpoint publico solo permite estadoPublicacion=publica',
    };
  }

  if (!publico && !esStaff && estados.includes('rechazada')) {
    return {
      ok: false,
      status: 403,
      message: 'El estado rechazada solo esta disponible para staff interno',
    };
  }

  return { ok: true, estados };
}

export async function obtenerContextoPartidoDesdeStat(tipo, entidadId) {
  if (!entidadId) return null;

  if (tipo === 'estadisticasJugadorSet') {
    const { default: EstadisticasJugadorSet } = await import('../models/Jugador/EstadisticasJugadorSet.js');
    const stat = await EstadisticasJugadorSet.findById(entidadId).select('set equipo').lean();
    if (!stat?.set) return null;
    const set = await SetPartido.findById(stat.set).select('partido').lean();
    if (!set?.partido) return null;
    return { partidoId: set.partido.toString(), equipoId: stat.equipo?.toString?.() };
  }

  if (tipo === 'estadisticasJugadorPartido') {
    const { default: EstadisticasJugadorPartido } = await import('../models/Jugador/EstadisticasJugadorPartido.js');
    const stat = await EstadisticasJugadorPartido.findById(entidadId).select('jugadorPartido').lean();
    if (!stat?.jugadorPartido) return null;
    const jp = await JugadorPartido.findById(stat.jugadorPartido).select('partido equipo').lean();
    if (!jp?.partido) return null;
    return { partidoId: jp.partido.toString(), equipoId: jp.equipo?.toString?.() };
  }

  if (tipo === 'estadisticasEquipoPartido') {
    const { default: EstadisticasEquipoPartido } = await import('../models/Equipo/EstadisticasEquipoPartido.js');
    const stat = await EstadisticasEquipoPartido.findById(entidadId).select('partido equipo').lean();
    if (!stat?.partido) return null;
    return { partidoId: stat.partido.toString(), equipoId: stat.equipo?.toString?.() };
  }

  return null;
}

export async function encolarSolicitudStatsLiga({
  tipo,
  entidadId,
  partidoId,
  equipoId,
  creadoPor,
  visibilidadObjetivo,
}) {
  if (!tipo || !entidadId || !partidoId || !creadoPor) {
    return { queued: false, reason: 'missing-fields' };
  }

  const partido = await Partido.findById(partidoId).select('competencia').lean();
  if (!partido?.competencia) {
    return { queued: false, reason: 'friendly-match' };
  }

  const solicitudPendiente = await SolicitudEdicion.findOne({
    tipo,
    entidad: entidadId,
    estado: 'pendiente',
  })
    .select('_id')
    .lean();

  if (solicitudPendiente?._id) {
    return { queued: true, solicitudId: solicitudPendiente._id.toString(), reused: true };
  }

  const nuevaSolicitud = await SolicitudEdicion.create({
    tipo,
    entidad: entidadId,
    creadoPor,
    datosPropuestos: {
      partidoId,
      equipoId: equipoId || null,
      visibilidadObjetivo: normalizarVisibilidadObjetivo(visibilidadObjetivo),
      origen: 'captura-estadisticas-liga',
    },
  });

  return { queued: true, solicitudId: nuevaSolicitud._id.toString(), reused: false };
}
