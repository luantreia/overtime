import Partido from '../models/Partido/Partido.js'
import ParticipacionFase from '../models/Equipo/ParticipacionFase.js'
import Fase from '../models/Competencia/Fase.js'
import ParticipacionTemporada from '../models/Equipo/ParticipacionTemporada.js'
import SetPartido from '../models/Partido/SetPartido.js'
import { StandingsService } from './StandingsService.js'

export async function actualizarParticipacionFase(id, faseId) {
  // id puede ser: ParticipacionFaseId o EquipoId
  let pf = null;
  try {
    pf = await ParticipacionFase.findById(id).populate({
      path: 'participacionTemporada',
      select: 'equipo temporada',
    });
  } catch (_) {
    // Ignorar si no es ObjectId válido
  }

  const fase = await Fase.findById(faseId).lean();
  if (!fase) return;

  const config = fase.configuracion || {};
  const rules = config.puntuacion || { victoria: 3, empate: 1, derrota: 0, setGanado: 0 };

  let equipoId = null;

  if (!pf) {
    // Interpretar id como EquipoId y obtener/crear la ParticipacionFase correspondiente
    equipoId = id;
    const fase = await Fase.findById(faseId).lean();
    if (!fase) return;

    const pt = await ParticipacionTemporada.findOne({ equipo: equipoId, temporada: fase.temporada });
    if (!pt) return; // No hay participación de temporada; no se puede actualizar tabla

    pf = await ParticipacionFase.findOne({ participacionTemporada: pt._id, fase: faseId });
    if (!pf) {
      pf = new ParticipacionFase({ participacionTemporada: pt._id, fase: faseId });
    }
  } else {
    equipoId = pf.participacionTemporada?.equipo?.toString?.() || null;
  }

  // Buscar partidos finalizados de la fase en los que participa el PF (o el equipo, como fallback)
  const orConds = [];
  if (pf?._id) {
    orConds.push({ participacionFaseLocal: pf._id }, { participacionFaseVisitante: pf._id });
  }
  if (equipoId) {
    orConds.push({ equipoLocal: equipoId }, { equipoVisitante: equipoId });
  }
  if (orConds.length === 0) return;

  const partidos = await Partido.find({ fase: faseId, estado: 'finalizado', $or: orConds }).lean();

  let puntos = 0;
  let partidosJugados = 0;
  let partidosGanados = 0;
  let partidosPerdidos = 0;
  let partidosEmpatados = 0;
  let diferenciaPuntos = 0;
  let setsGanados = 0;
  let setsPerdidos = 0;

  for (const p of partidos) {
    partidosJugados++;

    let esLocal = false;
    if (pf?._id && (p?.participacionFaseLocal?.toString?.() === pf._id.toString())) esLocal = true;
    else if (equipoId && (p?.equipoLocal?.toString?.() === equipoId.toString())) esLocal = true;

    const marcadorEquipo = esLocal ? (p.marcadorLocal ?? 0) : (p.marcadorVisitante ?? 0);
    const marcadorRival = esLocal ? (p.marcadorVisitante ?? 0) : (p.marcadorLocal ?? 0);

    diferenciaPuntos += (marcadorEquipo - marcadorRival);

    // Conteo de sets (si están registrados)
    const sets = await SetPartido.find({ partido: p._id, estadoSet: 'finalizado' }).lean();
    for (const s of sets) {
      if (s.ganadorSet === (esLocal ? 'local' : 'visitante')) {
        setsGanados++;
        puntos += (rules.setGanado || 0);
      } else if (s.ganadorSet === (esLocal ? 'visitante' : 'local')) {
        setsPerdidos++;
      }
    }

    if (marcadorEquipo > marcadorRival) {
      partidosGanados++;
      puntos += (rules.victoria ?? 3);
    } else if (marcadorEquipo < marcadorRival) {
      partidosPerdidos++;
      puntos += (rules.derrota ?? 0);
    } else {
      partidosEmpatados++;
      puntos += (rules.empate ?? 1);
    }
  }

  pf.puntos = puntos;
  pf.partidosJugados = partidosJugados;
  pf.partidosGanados = partidosGanados;
  pf.partidosPerdidos = partidosPerdidos;
  pf.partidosEmpatados = partidosEmpatados;
  pf.diferenciaPuntos = diferenciaPuntos;

  // Actualizar estadísticas de sets
  pf.set('statsSets', { ganados: setsGanados, perdidos: setsPerdidos, diferencia: setsGanados - setsPerdidos }, { strict: false });

  await pf.save();
  try {
    await StandingsService.calculateStandings(faseId);
  } catch (error) {
    console.error('Error al recalcular standings:', error);
  }
}