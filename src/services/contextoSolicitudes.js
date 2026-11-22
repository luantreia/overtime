import Partido from '../models/Partido/Partido.js';
import SetPartido from '../models/Partido/SetPartido.js';
import Equipo from '../models/Equipo/Equipo.js';
import Jugador from '../models/Jugador/Jugador.js';
import Organizacion from '../models/Organizacion.js';
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';

/**
 * Contexto legible de una solicitud: de qué partido, set, equipo o jugador habla, con nombres.
 *
 * Por qué existe: el detalle de una solicitud mostraba `datosPropuestos` crudo (setId, partidoId,
 * equipoId…) y quien aprueba no podía saber de qué partido se trataba sin abrir otra pantalla.
 * Se resuelve acá y no en cada frontend porque son cinco apps con la misma pantalla.
 *
 * Qué es `entidad` depende del tipo; lo que sigue sale de cómo cada tipo se aplica al aprobarse
 * (routes/solicitudEdicion.js), no de suposiciones.
 */
const ENTIDAD_ES = {
  partido: ['resultadoSet', 'resultadoPartido', 'editarPartidoCompetencia', 'editarPartidoVideo',
    'estadisticas-set-propuesta', 'estadisticas-partido-propuesta'],
  set: ['estadisticasJugadorSet-lote'],
  planilla: ['planilla-equipo-oficializacion'],
  equipo: ['usuario-solicitar-admin-equipo'],
  jugador: ['usuario-solicitar-admin-jugador', 'jugador-claim'],
  organizacion: ['usuario-solicitar-admin-organizacion'],
};

const esId = (v) => typeof v === 'string' ? /^[0-9a-f]{24}$/i.test(v) : Boolean(v && v.toString && /^[0-9a-f]{24}$/i.test(v.toString()));
const str = (v) => (v == null ? null : String(v));

/** Puro: a qué entidades apunta la solicitud (ids como string, o null). */
export function idsReferenciados(solicitud) {
  const datos = solicitud?.datosPropuestos || {};
  const entidad = esId(solicitud?.entidad) ? str(solicitud.entidad) : null;
  const por = (clave) => (entidad && ENTIDAD_ES[clave].includes(solicitud.tipo) ? entidad : null);
  const dato = (k) => (esId(datos[k]) ? str(datos[k]) : null);
  return {
    partido: dato('partidoId') ?? por('partido'),
    set: dato('setId') ?? por('set'),
    planilla: por('planilla'),
    equipo: dato('equipoId') ?? por('equipo'),
    jugador: dato('jugadorId') ?? por('jugador'),
    organizacion: dato('organizacionId') ?? por('organizacion'),
  };
}

const porId = (docs) => new Map(docs.map((d) => [String(d._id), d]));
const nombreJugador = (j) => (j ? j.nombre || j.alias || null : null);

/**
 * Agrega `contexto` a cada solicitud (in place, sobre objetos lean). Una consulta por modelo para
 * toda la página, no una por solicitud. Si algo ya no existe, ese dato queda en null: el contexto
 * es ayuda para leer, nunca motivo para que la lista falle.
 */
export async function agregarContexto(solicitudes) {
  const refs = solicitudes.map(idsReferenciados);
  const juntar = (k) => [...new Set(refs.map((r) => r[k]).filter(Boolean))];

  const [sets, planillas] = await Promise.all([
    SetPartido.find({ _id: { $in: juntar('set') } }).select('partido numeroSet').lean(),
    PlanillaEquipo.find({ _id: { $in: juntar('planilla') } }).select('partido equipo').lean(),
  ]);
  const setMap = porId(sets);
  const planillaMap = porId(planillas);

  // El partido puede venir directo, por el set o por la planilla.
  const partidoDe = (r) => r.partido ?? str(setMap.get(r.set)?.partido) ?? str(planillaMap.get(r.planilla)?.partido);
  const partidoIds = [...new Set(refs.map(partidoDe).filter(Boolean))];
  const partidos = await Partido.find({ _id: { $in: partidoIds } })
    .select('equipoLocal equipoVisitante fecha competencia nombrePartido')
    .populate('equipoLocal', 'nombre')
    .populate('equipoVisitante', 'nombre')
    .populate('competencia', 'nombre')
    .lean();
  const partidoMap = porId(partidos);

  const equipoDe = (r) => r.equipo ?? str(planillaMap.get(r.planilla)?.equipo);
  const [equipos, jugadores, orgs] = await Promise.all([
    Equipo.find({ _id: { $in: [...new Set(refs.map(equipoDe).filter(Boolean))] } }).select('nombre').lean(),
    Jugador.find({ _id: { $in: juntar('jugador') } }).select('nombre alias').lean(),
    Organizacion.find({ _id: { $in: juntar('organizacion') } }).select('nombre').lean(),
  ]);
  const equipoMap = porId(equipos);
  const jugadorMap = porId(jugadores);
  const orgMap = porId(orgs);

  solicitudes.forEach((s, i) => {
    const r = refs[i];
    const p = partidoMap.get(partidoDe(r));
    const set = setMap.get(r.set);
    const equipo = equipoMap.get(equipoDe(r));
    const jugador = jugadorMap.get(r.jugador);
    const org = orgMap.get(r.organizacion);
    s.contexto = {
      partido: p
        ? {
            id: String(p._id),
            local: p.equipoLocal?.nombre ?? null,
            visitante: p.equipoVisitante?.nombre ?? null,
            nombre: p.nombrePartido ?? null,
            fecha: p.fecha ?? null,
            competencia: p.competencia?.nombre ?? null,
          }
        : null,
      set: set ? { numero: set.numeroSet } : null,
      equipo: equipo ? { id: String(equipo._id), nombre: equipo.nombre } : null,
      jugador: jugador ? { id: String(jugador._id), nombre: nombreJugador(jugador) } : null,
      organizacion: org ? { id: String(org._id), nombre: org.nombre } : null,
    };
  });
  return solicitudes;
}
