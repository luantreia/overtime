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
