import Partido from '../models/Partido/Partido.js';
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';

/**
 * Qué partidos entran en el análisis de un equipo, y qué equipos se pueden pedir como
 * perspectiva sobre esos partidos.
 *
 * Dos fuentes, no una: los partidos donde el equipo jugó (local o visitante), y los partidos
 * que scouteó sin jugarlos (una `PlanillaEquipo` propia sobre un partido ajeno, ver
 * `validarEquipoJuegaElPartido` en planillaEquipoService.js). Sin la segunda fuente, un partido
 * scouteado entre dos terceros no aparece en ningún lado del análisis aunque el equipo haya
 * cargado toda la planilla — es el gap que este helper existe para cerrar.
 *
 * No decide qué campos traer de cada partido ni cómo poblarlos: cada caller
 * (`filasAnaliticasService.js`, la ruta `/partidos/timeline`) hace su propio `Partido.find`
 * sobre los ids que devuelve esto, con el `.select`/`.populate` que ya usaba.
 */
export async function resolverAlcanceEquipo(miEquipoId, { desde, hasta } = {}) {
  const rango = {};
  const desdeFecha = desde ? new Date(desde) : null;
  const hastaFecha = hasta ? new Date(hasta) : null;
  if (desdeFecha && !Number.isNaN(desdeFecha.getTime())) rango.$gte = desdeFecha;
  if (hastaFecha && !Number.isNaN(hastaFecha.getTime())) rango.$lte = hastaFecha;

  const filtroPropios = { $or: [{ equipoLocal: miEquipoId }, { equipoVisitante: miEquipoId }] };
  if (Object.keys(rango).length > 0) filtroPropios.fecha = rango;

  const propios = await Partido.find(filtroPropios)
    .select('_id equipoLocal equipoVisitante')
    .populate('equipoLocal', 'nombre escudo')
    .populate('equipoVisitante', 'nombre escudo')
    .lean();

  const idsPropios = new Set(propios.map((p) => String(p._id)));

  const misPlanillas = await PlanillaEquipo.find({ equipo: miEquipoId }).select('partido').lean();
  const idsScouteadosCandidatos = [
    ...new Set(misPlanillas.map((pl) => String(pl.partido))),
  ].filter((id) => !idsPropios.has(id));

  const filtroScouteados = { _id: { $in: idsScouteadosCandidatos } };
  if (Object.keys(rango).length > 0) filtroScouteados.fecha = rango;

  const scouteados = idsScouteadosCandidatos.length
    ? await Partido.find(filtroScouteados)
        .select('_id equipoLocal equipoVisitante')
        .populate('equipoLocal', 'nombre escudo')
        .populate('equipoVisitante', 'nombre escudo')
        .lean()
    : [];

  const partidoIds = [...idsPropios, ...scouteados.map((p) => String(p._id))];

  const equiposPorId = new Map();
  for (const partido of [...propios, ...scouteados]) {
    for (const equipo of [partido.equipoLocal, partido.equipoVisitante]) {
      if (!equipo?._id) continue;
      const id = String(equipo._id);
      if (!equiposPorId.has(id)) {
        equiposPorId.set(id, { _id: id, nombre: equipo.nombre, escudo: equipo.escudo ?? null });
      }
    }
  }

  return {
    partidoIds,
    equiposDisponibles: [...equiposPorId.values()],
  };
}
