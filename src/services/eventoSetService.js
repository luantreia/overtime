import EventoSet from '../models/Partido/EventoSet.js';
import SetPartido from '../models/Partido/SetPartido.js';
import PlanillaSet from '../models/Equipo/PlanillaSet.js';
import PlanillaPresente from '../models/Equipo/PlanillaPresente.js';
import PlanillaEstadistica from '../models/Equipo/PlanillaEstadistica.js';
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import { estadisticasDesdeEventos } from '../utils/supervivencia.js';

/**
 * Resuelve el set dueño de unas marcas: { tipo: 'oficial'|'planilla', set, partidoId, planilla? }.
 * Devuelve null si no existe.
 */
export async function resolverSet({ setPartido, planillaSet }) {
  if (setPartido) {
    const set = await SetPartido.findById(setPartido).lean();
    return set ? { tipo: 'oficial', set, partidoId: set.partido } : null;
  }
  if (planillaSet) {
    const set = await PlanillaSet.findById(planillaSet).lean();
    if (!set) return null;
    const planilla = await PlanillaEquipo.findById(set.planilla).lean();
    return planilla ? { tipo: 'planilla', set, planilla, partidoId: planilla.partido } : null;
  }
  return null;
}

/**
 * Alineación del set: la cargada en el set, o si no hay, los presentes (planilla) o los
 * jugadores del partido (oficial). → [{ id: jugadorId, lado: equipoId }]
 */
export async function alineacionDe(ref) {
  if (ref.set.alineacion?.length) {
    return ref.set.alineacion.map((a) => ({ id: String(a.jugador), lado: String(a.equipo) }));
  }
  if (ref.tipo === 'planilla') {
    const presentes = await PlanillaPresente.find({ planilla: ref.planilla._id, rol: { $ne: 'entrenador' } })
      .select('jugador equipo')
      .lean();
    return presentes.map((p) => ({ id: String(p.jugador), lado: String(p.equipo ?? ref.planilla.equipo) }));
  }
  const jps = await JugadorPartido.find({ partido: ref.partidoId }).select('jugador equipo').lean();
  return jps.map((j) => ({ id: String(j.jugador), lado: String(j.equipo) }));
}

/**
 * Las marcas mandan: si el set de una planilla tiene marcas, sus estadísticas (outs, hits,
 * catches, sobrevive) se recalculan desde ellas. `throws` no se puede derivar y queda como
 * esté. Sin marcas no se toca nada: se siguen cargando a mano.
 */
export async function sincronizarEstadisticasPlanilla(ref) {
  if (ref.tipo !== 'planilla') return { sincronizado: false };
  const eventos = await EventoSet.find({ planillaSet: ref.set._id }).lean();
  if (eventos.length === 0) return { sincronizado: false };

  const presentes = await PlanillaPresente.find({ planilla: ref.planilla._id }).select('_id jugador').lean();
  const presentePorJugador = new Map(presentes.map((p) => [String(p.jugador), p._id]));
  const alineacion = await alineacionDe(ref);
  const stats = estadisticasDesdeEventos(alineacion, eventos.map((e) => ({ ...e, jugador: String(e.jugador), por: e.por && String(e.por), entra: e.entra && String(e.entra) })), {
    inicio: ref.set.tiempo?.desde ?? 0,
    fin: ref.set.tiempo?.hasta ?? null,
  });

  const ops = [];
  for (const [jugadorId, s] of stats) {
    const presente = presentePorJugador.get(jugadorId);
    if (!presente) continue; // un jugador que no está en la planilla no tiene dónde guardarse
    ops.push({
      updateOne: {
        filter: { planillaSet: ref.set._id, planillaPresente: presente },
        update: {
          $set: { outs: s.outs, hits: s.hits, catches: s.catches, survive: s.sobrevive },
          $setOnInsert: { planilla: ref.planilla._id, throws: 0, creadoPor: ref.planilla.creadoPor },
        },
        upsert: true,
      },
    });
  }
  if (ops.length) await PlanillaEstadistica.bulkWrite(ops);
  return { sincronizado: true, jugadores: ops.length };
}
