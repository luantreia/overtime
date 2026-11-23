import Partido from '../models/Partido/Partido.js';
import SetPartido from '../models/Partido/SetPartido.js';
import Equipo from '../models/Equipo/Equipo.js';
import Jugador from '../models/Jugador/Jugador.js';
import Organizacion from '../models/Organizacion.js';
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';
import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';
import ParticipacionTemporada from '../models/Equipo/ParticipacionTemporada.js';
import JugadorTemporada from '../models/Jugador/JugadorTemporada.js';
import Temporada from '../models/Competencia/Temporada.js';
import EstadisticasJugadorPartido from '../models/Jugador/EstadisticasJugadorPartido.js';
import EstadisticasEquipoPartido from '../models/Equipo/EstadisticasEquipoPartido.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';

/**
 * Contexto legible de una solicitud: de qué partido, set, equipo, jugador o temporada habla, con
 * nombres.
 *
 * Por qué existe: el detalle de una solicitud mostraba `datosPropuestos` crudo (setId, partidoId,
 * contratoId…) y quien aprueba no podía saber de qué se trataba sin abrir otra pantalla. Se
 * resuelve acá y no en cada frontend porque son cinco apps con la misma pantalla.
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
  contrato: ['jugador-equipo-editar'],
  participacion: ['participacion-temporada-eliminar', 'participacion-temporada-actualizar'],
  jugadorTemporada: ['jugador-temporada-eliminar', 'jugador-temporada-actualizar'],
  statJugadorPartido: ['estadisticasJugadorPartido'],
  statEquipoPartido: ['estadisticasEquipoPartido'],
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
    contrato: dato('contratoId') ?? dato('jugadorEquipoId') ?? por('contrato'),
    participacion: dato('participacionTemporadaId') ?? por('participacion'),
    jugadorTemporada: dato('jugadorTemporadaId') ?? por('jugadorTemporada'),
    temporada: dato('temporadaId'),
    statJugadorPartido: por('statJugadorPartido'),
    statEquipoPartido: por('statEquipoPartido'),
  };
}

const porId = (docs) => new Map(docs.map((d) => [String(d._id), d]));
const nombreJugador = (j) => (j ? j.nombre || j.alias || null : null);
const buscar = (Model, ids, campos) =>
  ids.length ? Model.find({ _id: { $in: ids } }).select(campos).lean() : Promise.resolve([]);
const unicos = (arr) => [...new Set(arr.filter(Boolean).map(String))];

/**
 * Agrega `contexto` a cada solicitud (in place, sobre objetos lean). Va por capas: primero los
 * documentos intermedios (set, planilla, contrato, participación, estadística), después lo que
 * cuelga de ellos. Una consulta por modelo para toda la página, no una por solicitud. Si algo ya
 * no existe, ese dato queda en null: el contexto es ayuda para leer, nunca motivo para que la
 * lista falle.
 */
export async function agregarContexto(solicitudes) {
  const refs = solicitudes.map(idsReferenciados);
  const juntar = (k) => unicos(refs.map((r) => r[k]));

  // Capa 1: documentos que apuntan a otros.
  const [sets, planillas, jts, statsJP, statsEP] = await Promise.all([
    buscar(SetPartido, juntar('set'), 'partido numeroSet'),
    buscar(PlanillaEquipo, juntar('planilla'), 'partido equipo'),
    buscar(JugadorTemporada, juntar('jugadorTemporada'), 'jugador jugadorEquipo participacionTemporada'),
    buscar(EstadisticasJugadorPartido, juntar('statJugadorPartido'), 'jugadorPartido'),
    buscar(EstadisticasEquipoPartido, juntar('statEquipoPartido'), 'partido equipo'),
  ]);
  const setMap = porId(sets);
  const planillaMap = porId(planillas);
  const jtMap = porId(jts);
  const statJPMap = porId(statsJP);
  const statEPMap = porId(statsEP);

  // Capa 2: contratos, participaciones y jugador-partido (directos o desde la capa 1).
  const contratoDe = (r) => r.contrato ?? str(jtMap.get(r.jugadorTemporada)?.jugadorEquipo);
  const participacionDe = (r) => r.participacion ?? str(jtMap.get(r.jugadorTemporada)?.participacionTemporada);
  const [contratos, participaciones, jps] = await Promise.all([
    buscar(JugadorEquipo, unicos(refs.map(contratoDe)), 'jugador equipo'),
    buscar(ParticipacionTemporada, unicos(refs.map(participacionDe)), 'equipo temporada'),
    buscar(JugadorPartido, unicos(statsJP.map((s) => s.jugadorPartido)), 'partido jugador equipo'),
  ]);
  const contratoMap = porId(contratos);
  const participacionMap = porId(participaciones);
  const jpMap = porId(jps);
  const jpDe = (r) => jpMap.get(str(statJPMap.get(r.statJugadorPartido)?.jugadorPartido));

  // Capa 3: lo legible.
  const partidoDe = (r) =>
    r.partido ?? str(setMap.get(r.set)?.partido) ?? str(planillaMap.get(r.planilla)?.partido)
    ?? str(jpDe(r)?.partido) ?? str(statEPMap.get(r.statEquipoPartido)?.partido);
  const equipoDe = (r) =>
    r.equipo ?? str(planillaMap.get(r.planilla)?.equipo) ?? str(contratoMap.get(contratoDe(r))?.equipo)
    ?? str(participacionMap.get(participacionDe(r))?.equipo) ?? str(jpDe(r)?.equipo)
    ?? str(statEPMap.get(r.statEquipoPartido)?.equipo);
  const jugadorDe = (r) =>
    r.jugador ?? str(jtMap.get(r.jugadorTemporada)?.jugador) ?? str(contratoMap.get(contratoDe(r))?.jugador)
    ?? str(jpDe(r)?.jugador);
  const temporadaDe = (r) => r.temporada ?? str(participacionMap.get(participacionDe(r))?.temporada);

  const [partidos, equipos, jugadores, orgs, temporadas] = await Promise.all([
    unicos(refs.map(partidoDe)).length
      ? Partido.find({ _id: { $in: unicos(refs.map(partidoDe)) } })
          .select('equipoLocal equipoVisitante fecha competencia nombrePartido')
          .populate('equipoLocal', 'nombre')
          .populate('equipoVisitante', 'nombre')
          .populate('competencia', 'nombre')
          .lean()
      : [],
    buscar(Equipo, unicos(refs.map(equipoDe)), 'nombre'),
    buscar(Jugador, unicos(refs.map(jugadorDe)), 'nombre alias'),
    buscar(Organizacion, juntar('organizacion'), 'nombre'),
    unicos(refs.map(temporadaDe)).length
      ? Temporada.find({ _id: { $in: unicos(refs.map(temporadaDe)) } }).select('nombre competencia').populate('competencia', 'nombre').lean()
      : [],
  ]);
  const partidoMap = porId(partidos);
  const equipoMap = porId(equipos);
  const jugadorMap = porId(jugadores);
  const orgMap = porId(orgs);
  const temporadaMap = porId(temporadas);

  solicitudes.forEach((s, i) => {
    const r = refs[i];
    const p = partidoMap.get(partidoDe(r));
    const set = setMap.get(r.set);
    const equipo = equipoMap.get(equipoDe(r));
    const jugador = jugadorMap.get(jugadorDe(r));
    const org = orgMap.get(r.organizacion);
    const temp = temporadaMap.get(temporadaDe(r));
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
      temporada: temp ? { id: String(temp._id), nombre: temp.nombre ?? null, competencia: temp.competencia?.nombre ?? null } : null,
    };
  });
  return solicitudes;
}
