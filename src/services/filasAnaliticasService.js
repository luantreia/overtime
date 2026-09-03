import Partido from '../models/Partido/Partido.js';
import SetPartido from '../models/Partido/SetPartido.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';
import EstadisticasJugadorPartidoManual from '../models/Jugador/EstadisticasJugadorPartidoManual.js';
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';
import PlanillaPresente from '../models/Equipo/PlanillaPresente.js';
import PlanillaSet from '../models/Equipo/PlanillaSet.js';
import PlanillaEstadistica from '../models/Equipo/PlanillaEstadistica.js';

/**
 * Filas analíticas de un equipo: una por jugador y por set (o por partido, en captura directa),
 * con los atributos del partido desnormalizados encima y la fuente ya resuelta.
 *
 * Es el único dataset del que cuelga toda la pantalla de estadísticas del DT. Tenerlo plano y en
 * una sola respuesta es lo que permite, sin volver al servidor:
 *
 * - agregar métricas sobre lo que los filtros dejaron a la vista, en vez de tener un bloque de
 *   "oficial" y otro de "mis planillas" que nunca se suman;
 * - comparar segmentos entre sí (2025 contra 2026, foam masculino contra cloth masculino)
 *   corriendo la misma agregación sobre distintos subconjuntos de las mismas filas;
 * - cruzar por jugador, rival, modalidad o resultado del set sin una consulta por combinación.
 *
 * Cada partido aporta filas de UNA sola fuente. Si tiene estadísticas oficiales y planilla
 * propia, manda `PlanillaEquipo.fuentePreferida`; si sólo tiene una, esa. Nunca se mezclan las
 * dos en el mismo partido: sumarían al mismo jugador dos veces.
 */
export async function obtenerFilasAnaliticas(equipoId, { desde, hasta } = {}) {
  const filtro = { $or: [{ equipoLocal: equipoId }, { equipoVisitante: equipoId }] };

  const rango = {};
  const desdeFecha = desde ? new Date(desde) : null;
  const hastaFecha = hasta ? new Date(hasta) : null;
  if (desdeFecha && !Number.isNaN(desdeFecha.getTime())) rango.$gte = desdeFecha;
  if (hastaFecha && !Number.isNaN(hastaFecha.getTime())) rango.$lte = hastaFecha;
  if (Object.keys(rango).length > 0) filtro.fecha = rango;

  const partidos = await Partido.find(filtro)
    .select(
      'fecha estado modalidad categoria equipoLocal equipoVisitante competencia temporada fase ' +
        'marcadorLocal marcadorVisitante'
    )
    .populate('equipoLocal', 'nombre')
    .populate('equipoVisitante', 'nombre')
    .populate({
      path: 'competencia',
      select: 'nombre modalidad categoria organizacion',
      populate: { path: 'organizacion', select: 'nombre' },
    })
    .populate('temporada', 'nombre')
    .populate('fase', 'nombre')
    .sort({ fecha: -1 })
    .lean();

  if (partidos.length === 0) return [];

  const partidoIds = partidos.map((p) => p._id);

  const [sets, jugadorPartidos, planillas] = await Promise.all([
    SetPartido.find({ partido: { $in: partidoIds } })
      .select('_id partido numeroSet ganadorSet')
      .lean(),
    JugadorPartido.find({ partido: { $in: partidoIds }, equipo: equipoId })
      .select('_id partido jugador')
      .populate('jugador', 'nombre apellido alias')
      .lean(),
    PlanillaEquipo.find({ partido: { $in: partidoIds }, equipo: equipoId })
      .select('_id partido modo fuentePreferida')
      .lean(),
  ]);

  const planillaIds = planillas.map((p) => p._id);

  const [statsSet, statsManual, presentes, planillaSets, planillaStats] = await Promise.all([
    EstadisticasJugadorSet.find({ set: { $in: sets.map((s) => s._id) }, equipo: equipoId })
      .select('set jugadorPartido throws hits outs catches survive')
      .lean(),
    EstadisticasJugadorPartidoManual.find({
      jugadorPartido: { $in: jugadorPartidos.map((jp) => jp._id) },
    })
      .select('jugadorPartido throws hits outs catches')
      .lean(),
    PlanillaPresente.find({ planilla: { $in: planillaIds } })
      .select('_id planilla jugador')
      .populate('jugador', 'nombre apellido alias')
      .lean(),
    PlanillaSet.find({ planilla: { $in: planillaIds } })
      .select('_id planilla numeroSet ganadorSet')
      .lean(),
    PlanillaEstadistica.find({ planilla: { $in: planillaIds } })
      .select('planilla planillaSet planillaPresente throws hits outs catches survive')
      .lean(),
  ]);

  const nombreDe = (j) => {
    if (!j || typeof j === 'string') return 'Jugador';
    return j.alias || [j.nombre, j.apellido].filter(Boolean).join(' ').trim() || 'Jugador';
  };

  const porId = (arr) => new Map(arr.map((x) => [String(x._id), x]));
  const agrupar = (arr, clave) => {
    const mapa = new Map();
    for (const item of arr) {
      const k = String(item[clave]);
      const lista = mapa.get(k);
      if (lista) lista.push(item);
      else mapa.set(k, [item]);
    }
    return mapa;
  };

  const setPorId = porId(sets);
  const jpPorId = porId(jugadorPartidos);
  const presentePorId = porId(presentes);
  const planillaSetPorId = porId(planillaSets);

  const setsPorPartido = agrupar(sets, 'partido');
  const statsSetPorSet = agrupar(statsSet, 'set');
  const jpPorPartido = agrupar(jugadorPartidos, 'partido');
  const statsManualPorJp = agrupar(statsManual, 'jugadorPartido');
  const planillaPorPartido = new Map(planillas.map((pl) => [String(pl.partido), pl]));
  const statsPlanillaPorPlanilla = agrupar(planillaStats, 'planilla');

  /** 'local'/'visitante' del dato crudo, traducido a la óptica del equipo que consulta. */
  const resultadoDesdeGanador = (ganador, esLocal) => {
    if (ganador === 'empate') return 'empate';
    if (ganador === 'local') return esLocal ? 'ganado' : 'perdido';
    if (ganador === 'visitante') return esLocal ? 'perdido' : 'ganado';
    return 'sin definir';
  };

  const filas = [];

  for (const partido of partidos) {
    const pid = String(partido._id);
    const esLocal = String(partido.equipoLocal?._id) === String(equipoId);
    const rival = esLocal ? partido.equipoVisitante : partido.equipoLocal;

    const marcadorEquipo = (esLocal ? partido.marcadorLocal : partido.marcadorVisitante) ?? 0;
    const marcadorRival = (esLocal ? partido.marcadorVisitante : partido.marcadorLocal) ?? 0;

    // Un partido sin cerrar no cuenta como ganado ni perdido: si contara, el porcentaje de
    // victorias de una temporada en curso mezclaría partidos jugados con partidos por jugar.
    let resultadoPartido = 'sin definir';
    if (partido.estado === 'finalizado') {
      if (marcadorEquipo > marcadorRival) resultadoPartido = 'ganado';
      else if (marcadorEquipo < marcadorRival) resultadoPartido = 'perdido';
      else resultadoPartido = 'empate';
    }

    const contexto = {
      partidoId: pid,
      fecha: partido.fecha,
      estadoPartido: partido.estado,
      // Del partido, no de su competencia: son campos propios y obligatorios, y los amistosos
      // no tienen competencia de la cual heredarlos.
      modalidad: partido.modalidad ?? partido.competencia?.modalidad ?? 'Sin modalidad',
      categoria: partido.categoria ?? partido.competencia?.categoria ?? 'Sin categoría',
      competenciaId: partido.competencia ? String(partido.competencia._id) : null,
      competencia: partido.competencia?.nombre ?? 'Amistoso',
      organizacionId: partido.competencia?.organizacion
        ? String(partido.competencia.organizacion._id)
        : null,
      organizacion: partido.competencia?.organizacion?.nombre ?? 'Amistoso',
      temporadaId: partido.temporada ? String(partido.temporada._id) : null,
      temporada: partido.temporada?.nombre ?? 'Sin temporada',
      faseId: partido.fase ? String(partido.fase._id) : null,
      fase: partido.fase?.nombre ?? 'Sin fase',
      rivalId: rival ? String(rival._id) : null,
      rival: rival?.nombre ?? 'Rival',
      esLocal,
      marcadorEquipo,
      marcadorRival,
      resultadoPartido,
    };

    const planilla = planillaPorPartido.get(pid) ?? null;

    const statsSetDelPartido = (setsPorPartido.get(pid) ?? []).flatMap(
      (s) => statsSetPorSet.get(String(s._id)) ?? []
    );
    const statsManualDelPartido = (jpPorPartido.get(pid) ?? []).flatMap(
      (jp) => statsManualPorJp.get(String(jp._id)) ?? []
    );
    const hayOficial = statsSetDelPartido.length > 0 || statsManualDelPartido.length > 0;
    const hayPlanilla = Boolean(planilla) && (statsPlanillaPorPlanilla.get(String(planilla._id)) ?? []).length > 0;

    let fuente = null;
    if (hayOficial && hayPlanilla) {
      fuente = planilla.fuentePreferida === 'planilla' ? 'planilla' : 'oficial';
    } else if (hayOficial) fuente = 'oficial';
    else if (hayPlanilla) fuente = 'planilla';

    if (!fuente) {
      // Sin estadísticas de ninguna fuente igual se emite una fila sin jugador, para que el
      // partido exista en los conteos de "partidos jugados" y en el porcentaje de victorias.
      // Un partido ganado sin planilla cargada sigue siendo un partido ganado.
      filas.push({ ...contexto, fuente: null, numeroSet: null, resultadoSet: 'sin definir', jugadorId: null, jugador: null, throws: 0, hits: 0, outs: 0, catches: 0, survive: false });
      continue;
    }

    if (fuente === 'oficial') {
      for (const stat of statsSetDelPartido) {
        const jp = jpPorId.get(String(stat.jugadorPartido));
        const setDoc = setPorId.get(String(stat.set));
        filas.push({
          ...contexto,
          fuente: 'oficial',
          numeroSet: setDoc?.numeroSet ?? null,
          resultadoSet: resultadoDesdeGanador(setDoc?.ganadorSet, esLocal),
          jugadorId: jp?.jugador ? String(jp.jugador._id ?? jp.jugador) : null,
          jugador: nombreDe(jp?.jugador),
          throws: stat.throws || 0,
          hits: stat.hits || 0,
          outs: stat.outs || 0,
          catches: stat.catches || 0,
          survive: Boolean(stat.survive),
        });
      }

      // La captura directa no tiene sets: es un total por jugador para todo el partido.
      for (const stat of statsManualDelPartido) {
        const jp = jpPorId.get(String(stat.jugadorPartido));
        filas.push({
          ...contexto,
          fuente: 'oficial',
          numeroSet: null,
          resultadoSet: 'sin definir',
          jugadorId: jp?.jugador ? String(jp.jugador._id ?? jp.jugador) : null,
          jugador: nombreDe(jp?.jugador),
          throws: stat.throws || 0,
          hits: stat.hits || 0,
          outs: stat.outs || 0,
          catches: stat.catches || 0,
          survive: false,
        });
      }
      continue;
    }

    for (const stat of statsPlanillaPorPlanilla.get(String(planilla._id)) ?? []) {
      const presente = presentePorId.get(String(stat.planillaPresente));
      const setDoc = stat.planillaSet ? planillaSetPorId.get(String(stat.planillaSet)) : null;
      filas.push({
        ...contexto,
        fuente: 'planilla',
        numeroSet: setDoc?.numeroSet ?? null,
        resultadoSet: resultadoDesdeGanador(setDoc?.ganadorSet, esLocal),
        jugadorId: presente?.jugador ? String(presente.jugador._id ?? presente.jugador) : null,
        jugador: nombreDe(presente?.jugador),
        throws: stat.throws || 0,
        hits: stat.hits || 0,
        outs: stat.outs || 0,
        catches: stat.catches || 0,
        survive: Boolean(stat.survive),
      });
    }
  }

  return filas;
}
