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

const { Types } = mongoose;

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
 * El equipo tiene que ser uno de los dos que juegan el partido.
 *
 * Sin esto, cualquiera con stats.capture en su propio club abre planillas sobre
 * partidos ajenos y después pide oficializarlas.
 */
export async function validarEquipoJuegaElPartido(partidoId, equipoId) {
  if (!partidoId || !Types.ObjectId.isValid(partidoId)) {
    return { ok: false, status: 400, message: 'partido inválido' };
  }
  if (!equipoId || !Types.ObjectId.isValid(equipoId)) {
    return { ok: false, status: 400, message: 'equipo inválido' };
  }

  const partido = await Partido.findById(partidoId)
    .select('equipoLocal equipoVisitante competencia estado')
    .lean();

  if (!partido) {
    return { ok: false, status: 404, message: 'Partido no encontrado' };
  }

  const juega = [partido.equipoLocal, partido.equipoVisitante]
    .filter(Boolean)
    .some((id) => String(id) === String(equipoId));

  if (!juega) {
    return {
      ok: false,
      status: 403,
      message: 'El equipo no participa de este partido',
    };
  }

  return { ok: true, partido };
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
