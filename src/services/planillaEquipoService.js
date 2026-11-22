// services/planillaEquipoService.js
//
// Helpers de la planilla de equipo. La idea central: la planilla se valida SIEMPRE
// contra el recurso (el partido y sus dos equipos), nunca contra lo que declara quien
// llama. Es la misma lección de routes/Jugadores/estadisticasJugadorSet.js, donde el
// equipo se deriva del JugadorPartido en vez de tomarse del body.
import mongoose from 'mongoose';
import Partido from '../models/Partido/Partido.js';
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';
import PlanillaPresente from '../models/Equipo/PlanillaPresente.js';
import PlanillaSet from '../models/Equipo/PlanillaSet.js';
import PlanillaEstadistica from '../models/Equipo/PlanillaEstadistica.js';
import EquipoCompetencia from '../models/Equipo/EquipoCompetencia.js';
import ParticipacionTemporada from '../models/Equipo/ParticipacionTemporada.js';
import Jugador from '../models/Jugador/Jugador.js';
import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';
import Organizacion from '../models/Organizacion.js';
import MiembroOrganizacion from '../models/Organizacion/MiembroOrganizacion.js';
import { hasTeamPermission } from './teamPermissionService.js';
import { hasMatchPermission } from './matchPermissionService.js';

const { Types } = mongoose;

/** ¿El equipo jugó este partido, como local o visitante? */
function equipoEsParticipante(partido, equipoId) {
  return [partido.equipoLocal, partido.equipoVisitante]
    .filter(Boolean)
    .some((id) => String(id) === String(equipoId));
}

/** Estados en los que la planilla ya no admite ediciones del equipo. */
const ESTADOS_CERRADOS = new Set(['pendiente_oficializacion', 'oficializada']);

export function planillaEstaCerrada(planilla) {
  return ESTADOS_CERRADOS.has(planilla?.estado);
}

/**
 * Estados en los que la organización del partido puede leer una planilla AJENA (de un
 * equipo o un jugador). Antes de que se pida oficializar, la planilla es trabajo privado
 * del dueño y la organización no la ve, ni siquiera en borrador.
 */
const ESTADOS_VISIBLES_PARA_ORGANIZACION = new Set(['pendiente_oficializacion', 'oficializada', 'rechazada']);

/**
 * La matriz de acceso a una planilla, sin tocar la base: recibe los hechos ya resueltos
 * sobre el usuario y decide. Separada de `puedeAccederPlanilla` para poder testearla
 * caso por caso (tests/unit/accesoPlanilla.test.js) — es la pieza donde un error filtra
 * planillas privadas.
 *
 * @param {object} p
 * @param {{ tipoDuenio?: string, estado?: string }} p.planilla
 * @param {'leer'|'editar'} p.accion
 * @param {object} p.hechos
 * @param {boolean} [p.hechos.esAdminGlobal]
 * @param {boolean} [p.hechos.esCuerpoTecnico]   permiso de equipo sobre `planilla.equipo` (stats.view_private para leer, stats.capture para editar)
 * @param {boolean} [p.hechos.esJugadorDelPlantel] contrato con `planilla.equipo` vigente a la fecha del partido
 * @param {boolean} [p.hechos.esJugadorDuenio]   el usuario es (o administra) `planilla.jugador`
 * @param {boolean} [p.hechos.esAdminOrganizacionDuenia] administra `planilla.organizacion`
 * @param {boolean} [p.hechos.esOrganizacionDelPartido]  match.view_private sobre el partido
 * @returns {{ permitido: boolean, ocultarNotas: boolean }}
 */
export function decidirAccesoPlanilla({ planilla, accion, hechos = {} }) {
  const NO = { permitido: false, ocultarNotas: true };
  const COMPLETO = { permitido: true, ocultarNotas: false };
  const tipo = planilla?.tipoDuenio || 'equipo';

  if (hechos.esAdminGlobal) return COMPLETO;

  if (accion === 'editar') {
    if (tipo === 'equipo') return hechos.esCuerpoTecnico ? COMPLETO : NO;
    if (tipo === 'jugador') return hechos.esJugadorDuenio ? COMPLETO : NO;
    if (tipo === 'organizacion') return hechos.esAdminOrganizacionDuenia ? COMPLETO : NO;
    return NO;
  }

  if (accion !== 'leer') return NO;

  if (tipo === 'equipo') {
    if (hechos.esCuerpoTecnico) return COMPLETO;
    // El plantel ve los números de su equipo, pero no las notas: ahí el cuerpo técnico
    // escribe scouting y observaciones que no necesariamente quiere mostrar.
    if (hechos.esJugadorDelPlantel) return { permitido: true, ocultarNotas: true };
  }
  if (tipo === 'jugador' && hechos.esJugadorDuenio) return COMPLETO;
  if (tipo === 'organizacion' && hechos.esAdminOrganizacionDuenia) return COMPLETO;

  // La organización del partido entra recién cuando se pidió oficializar. Ve las notas:
  // ese es el momento en que el dueño le está mandando la planilla para revisar.
  if (
    tipo !== 'organizacion'
    && hechos.esOrganizacionDelPartido
    && ESTADOS_VISIBLES_PARA_ORGANIZACION.has(planilla?.estado)
  ) {
    return COMPLETO;
  }

  return NO;
}

/** ¿El usuario es el jugador (o administra la ficha del jugador)? */
async function usuarioEsJugador(jugadorId, usuarioId) {
  if (!jugadorId) return false;
  const jugador = await Jugador.findById(jugadorId).select('userId administradores').lean();
  if (!jugador) return false;
  return String(jugador.userId || '') === String(usuarioId)
    || (jugador.administradores || []).some((a) => String(a) === String(usuarioId));
}

/**
 * ¿El usuario tiene una ficha de jugador con contrato con este equipo vigente a la fecha
 * del partido? Misma regla de vigencia que el resto del backend: `estado` y fechas son
 * ejes distintos (un 'aceptado' con `hasta` vencido ya no está en el equipo).
 */
async function usuarioEsDelPlantel(equipoId, partidoId, usuarioId) {
  if (!equipoId) return false;
  const [fichas, partido] = await Promise.all([
    Jugador.find({ $or: [{ userId: String(usuarioId) }, { administradores: String(usuarioId) }] }).select('_id').lean(),
    Partido.findById(partidoId).select('fecha').lean(),
  ]);
  if (!fichas.length) return false;
  const fecha = partido?.fecha || new Date();
  const contrato = await JugadorEquipo.findOne({
    jugador: { $in: fichas.map((f) => f._id) },
    equipo: equipoId,
    estado: 'aceptado',
    $and: [
      { $or: [{ desde: null }, { desde: { $exists: false } }, { desde: { $lte: fecha } }] },
      { $or: [{ hasta: null }, { hasta: { $exists: false } }, { hasta: { $gte: fecha } }] },
    ],
  }).select('_id').lean();
  return Boolean(contrato);
}

/** ¿El usuario administra la organización (creador, administrador o miembro activo)? */
async function usuarioAdministraOrganizacion(organizacionId, usuarioId) {
  if (!organizacionId) return false;
  const org = await Organizacion.findById(organizacionId).select('creadoPor administradores').lean();
  if (!org) return false;
  if (String(org.creadoPor || '') === String(usuarioId)) return true;
  if ((org.administradores || []).some((a) => String(a) === String(usuarioId))) return true;
  const miembro = await MiembroOrganizacion.exists({
    organizacion: organizacionId,
    usuarioId: String(usuarioId),
    estado: 'activo',
    rol: { $in: ROLES_ORGANIZACION_EDITORES },
  });
  return Boolean(miembro);
}

const ROLES_ORGANIZACION_EDITORES = ['presidente', 'secretario', 'coordinador'];

/**
 * Único punto de decisión de acceso a una planilla, para REST y sockets. Resuelve sólo
 * los hechos que el tipo de dueño necesita (no consulta contratos para una planilla de
 * organización, etc.) y delega la decisión en `decidirAccesoPlanilla`.
 *
 * @param {object} p
 * @param {object} p.planilla  doc o lean con tipoDuenio, estado, partido y la ref del dueño
 * @param {{ uid?: string, rol?: string }} p.usuario  req.user
 * @param {'leer'|'editar'} p.accion
 */
export async function puedeAccederPlanilla({ planilla, usuario, accion }) {
  const usuarioId = usuario?.uid;
  if (!planilla || !usuarioId) return { permitido: false, ocultarNotas: true };

  const tipo = planilla.tipoDuenio || 'equipo';
  const hechos = { esAdminGlobal: (usuario.rol || '').toLowerCase() === 'admin' };
  const decidir = () => decidirAccesoPlanilla({ planilla, accion, hechos });
  if (hechos.esAdminGlobal) return decidir();

  if (tipo === 'equipo') {
    hechos.esCuerpoTecnico = await hasTeamPermission({
      equipoId: String(planilla.equipo),
      usuarioId,
      rolGlobal: usuario.rol,
      permission: accion === 'editar' ? 'stats.capture' : 'stats.view_private',
    });
    if (hechos.esCuerpoTecnico || accion === 'editar') return decidir();
    hechos.esJugadorDelPlantel = await usuarioEsDelPlantel(planilla.equipo, planilla.partido, usuarioId);
  } else if (tipo === 'jugador') {
    hechos.esJugadorDuenio = await usuarioEsJugador(planilla.jugador, usuarioId);
  } else if (tipo === 'organizacion') {
    hechos.esAdminOrganizacionDuenia = await usuarioAdministraOrganizacion(planilla.organizacion, usuarioId);
  }

  const resultado = decidir();
  if (resultado.permitido || accion !== 'leer' || tipo === 'organizacion') return resultado;
  if (!ESTADOS_VISIBLES_PARA_ORGANIZACION.has(planilla.estado)) return resultado;

  hechos.esOrganizacionDelPartido = await hasMatchPermission({
    partidoId: String(planilla.partido),
    usuarioId,
    rolGlobal: usuario.rol,
    permission: 'match.view_private',
  });
  return decidir();
}

/** Saca los campos que el acceso no habilita a ver. */
export function recortarPlanillaSegunAcceso(planilla, acceso) {
  if (!planilla || !acceso?.ocultarNotas) return planilla;
  const { notas, ...resto } = planilla;
  return resto;
}

/** Resuelve el equipo dueño de la planilla, para validar permisos sobre ella. */
export async function getEquipoIdFromPlanilla(planillaId) {
  if (!planillaId || !Types.ObjectId.isValid(planillaId)) return null;
  const planilla = await PlanillaEquipo.findById(planillaId).select('equipo').lean();
  return planilla?.equipo ? String(planilla.equipo) : null;
}

/**
 * El equipo tiene que ser uno de los dos que juegan el partido, O (scouting) estar
 * inscripto en la competencia del partido.
 *
 * Sin la primera parte, cualquiera con stats.capture en su propio club abre planillas
 * sobre partidos ajenos y después pide oficializarlas. La segunda parte es lo que
 * habilita el scouting: un equipo puede reconstruir un partido de su propia competencia
 * aunque no lo haya jugado, para tener con qué compararse. Un amistoso no tiene
 * competencia en la que "estar inscripto" — ahí sólo entra el primer caso.
 *
 * La inscripción se rastrea por DOS caminos que no se pisan — `equipos-competencia`
 * (Overtime-Organizaciones/equipoCompetenciaService.ts los junta y por eso el frontend
 * puede mostrar una competencia como "inscripta" sin que exista fila en el primero):
 *   1. `EquipoCompetencia` — equipo↔competencia directo, estado 'aceptado'.
 *   2. `ParticipacionTemporada` — equipo↔temporada, estado 'activo'. Es el camino real
 *      hoy (la plataforma administra por Competencia → Temporada → Fase), así que se
 *      valida contra `partido.temporada` en vez de resolver la competencia de esa
 *      temporada — el partido ya tiene los dos ids propios.
 *
 * Devuelve `modo: 'propio'|'scouting'` para que el caller sepa si el equipo jugó de
 * verdad este partido o lo está scouteando.
 */
export async function validarEquipoJuegaElPartido(partidoId, equipoId) {
  if (!partidoId || !Types.ObjectId.isValid(partidoId)) {
    return { ok: false, status: 400, message: 'partido inválido' };
  }
  if (!equipoId || !Types.ObjectId.isValid(equipoId)) {
    return { ok: false, status: 400, message: 'equipo inválido' };
  }

  const partido = await Partido.findById(partidoId)
    .select('equipoLocal equipoVisitante competencia temporada estado')
    .lean();

  if (!partido) {
    return { ok: false, status: 404, message: 'Partido no encontrado' };
  }

  if (equipoEsParticipante(partido, equipoId)) {
    return { ok: true, partido, modo: 'propio' };
  }

  if (!partido.competencia) {
    return {
      ok: false,
      status: 403,
      message: 'El equipo no participa de este partido',
    };
  }

  const [porCompetencia, porTemporada] = await Promise.all([
    EquipoCompetencia.findOne({
      equipo: equipoId,
      competencia: partido.competencia,
      estado: 'aceptado',
    })
      .select('_id')
      .lean(),
    partido.temporada
      ? ParticipacionTemporada.findOne({
          equipo: equipoId,
          temporada: partido.temporada,
          estado: 'activo',
        })
          .select('_id')
          .lean()
      : null,
  ]);

  if (!porCompetencia && !porTemporada) {
    return {
      ok: false,
      status: 403,
      message: 'El equipo no participa de este partido ni está inscripto en su competencia',
    };
  }

  return { ok: true, partido, modo: 'scouting' };
}

/**
 * El equipo de un PRESENTE (no el dueño de la planilla) tiene que ser uno de los dos
 * que jugaron el partido. Un presente siempre es "alguien que estuvo en esta cancha",
 * sea de tu plantel o del rival — nunca de un tercero ajeno al partido, ni siquiera si
 * ese tercero está inscripto en la misma competencia (eso lo cubre el scouting a nivel
 * de planilla, no a nivel de presente individual).
 */
export function validarPresenteEquipoValido(partido, equipoId) {
  if (!equipoId || !Types.ObjectId.isValid(equipoId)) {
    return { ok: false, status: 400, message: 'equipo del presente inválido' };
  }
  if (!equipoEsParticipante(partido, equipoId)) {
    return { ok: false, status: 403, message: 'El equipo del presente no jugó este partido' };
  }
  return { ok: true };
}

/**
 * Trae la planilla entera. Es lo que consume la vista de análisis del equipo y
 * también el visor comparativo del organizador cuando revisa la oficialización.
 */
export async function obtenerPlanillaCompleta(planillaId) {
  if (!planillaId || !Types.ObjectId.isValid(planillaId)) return null;

  const planilla = await PlanillaEquipo.findById(planillaId)
    .populate('equipo', 'nombre escudo')
    .lean();
  if (!planilla) return null;

  const [presentes, sets, estadisticas] = await Promise.all([
    PlanillaPresente.find({ planilla: planillaId })
      .populate('jugador', 'nombre apellido alias foto')
      .sort({ numero: 1 })
      .lean(),
    PlanillaSet.find({ planilla: planillaId }).sort({ numeroSet: 1 }).lean(),
    PlanillaEstadistica.find({ planilla: planillaId }).lean(),
  ]);

  return { ...planilla, presentes, sets, estadisticas };
}

/** Borra la planilla y todo lo que cuelga de ella. */
export async function eliminarPlanillaEnCascada(planillaId, session = null) {
  const opts = session ? { session } : {};
  await Promise.all([
    PlanillaEstadistica.deleteMany({ planilla: planillaId }, opts),
    PlanillaSet.deleteMany({ planilla: planillaId }, opts),
    PlanillaPresente.deleteMany({ planilla: planillaId }, opts),
  ]);
  await PlanillaEquipo.deleteOne({ _id: planillaId }, opts);
}
