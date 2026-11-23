// services/planillaOficializacionService.js
//
// Traslada una PlanillaEquipo al registro oficial. Es el ÚNICO lugar donde la
// captura de un equipo puede escribir en las colecciones de la competencia, y solo
// se llama después de una aprobación (o cuando el partido es amistoso y no hay
// organizador que apruebe).
//
// Dos reglas de no colisión, para que las planillas de los dos equipos puedan
// oficializarse sin pisarse:
//
//   1. Cada fila escribe a nombre de `presente.equipo`, no de `planilla.equipo`: desde
//      que una planilla puede tener presentes del rival (o, en modo scouting, de los
//      dos equipos de un partido ajeno), un presente ya no es siempre "del dueño de la
//      planilla" — la partición real es por equipo individual de cada presente.
//   2. Los sets y la convocatoria se CREAN, nunca se sobreescriben. Si ya existen, la
//      planilla los referencia y deja su contenido intacto: el resultado de un set
//      sigue siendo del organizador aunque la planilla del equipo diga otra cosa.
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';
import PlanillaPresente from '../models/Equipo/PlanillaPresente.js';
import PlanillaSet from '../models/Equipo/PlanillaSet.js';
import PlanillaEstadistica from '../models/Equipo/PlanillaEstadistica.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import Partido from '../models/Partido/Partido.js';
import SetPartido from '../models/Partido/SetPartido.js';
import EventoSet from '../models/Partido/EventoSet.js';
import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';
import EstadisticasJugadorPartidoManual from '../models/Jugador/EstadisticasJugadorPartidoManual.js';
import { recalcularAgregadosDeJugadorPartido } from '../utils/estadisticasAggregator.js';
import { seleccionPlanilla } from '../utils/seleccionAprobacion.js';

/**
 * @param {object} params
 * @param {string} params.planillaId
 * @param {'organizacion'|'publica'} params.visibilidad
 * @param {string} params.uid quien ejecuta (aprobador, o el propio equipo en amistoso)
 * @param {string} [params.solicitudId]
 * @param {import('mongoose').ClientSession} [params.session]
 * @returns {Promise<{ jugadorPartidosARecalcular: string[], partidoId: string, equipoId: string, setsCreados: number, setsPisados: number, marcadorDesactualizado: boolean, resumen: object|null }>}
 *   Los agregados NO se recalculan acá cuando hay sesión: el aggregator no la recibe
 *   y adentro de la transacción leería datos que todavía no están visibles. El caller
 *   recalcula después de commitear, igual que hace routes/solicitudEdicion.js.
 */
export async function aplicarPlanillaOficializada({
  planillaId,
  visibilidad,
  uid,
  solicitudId = null,
  session = null,
  // Aprobación parcial (utils/seleccionAprobacion.js): qué jugadores, si los sets, y qué sets
  // existentes toman el resultado de la planilla. null = todo, como siempre.
  seleccion = null,
}) {
  const q = (query) => (session ? query.session(session) : query);
  const opts = session ? { session } : {};
  const upsertOpts = { upsert: true, new: true, setDefaultsOnInsert: true, ...opts };

  const planilla = await q(PlanillaEquipo.findById(planillaId));
  if (!planilla) throw new Error('La planilla de la solicitud ya no existe');

  const [presentes, sets, estadisticas] = await Promise.all([
    q(PlanillaPresente.find({ planilla: planillaId })).lean(),
    q(PlanillaSet.find({ planilla: planillaId }).sort({ numeroSet: 1 })).lean(),
    q(PlanillaEstadistica.find({ planilla: planillaId })).lean(),
  ]);

  const partidoId = String(planilla.partido);
  const equipoId = String(planilla.equipo);
  const jugadorPartidosARecalcular = new Set();
  const sel = seleccionPlanilla(seleccion, { presentes, sets });

  // 1) Convocatoria. Se crea solo lo que falta; una fila oficial existente no se toca.
  // Un presente no elegido no entra, y por eso tampoco sus estadísticas (paso 3 las salta).
  const jugadorPartidoPorPresente = new Map();
  for (const presente of presentes) {
    if (!sel.presentes.has(String(presente._id))) continue;
    // `presente.equipo` y no `planilla.equipo`: el presente puede ser del rival o, en
    // modo scouting, de cualquiera de los dos equipos del partido. Si un presente viejo
    // no tiene `equipo` seteado (documentos de antes del backfill), cae a
    // `planilla.equipo` — que es correcto para ese caso, ya que antes sólo existía esa
    // opción.
    const equipoDelPresente = presente.equipo || planilla.equipo;
    const jp = await JugadorPartido.findOneAndUpdate(
      { partido: planilla.partido, jugador: presente.jugador },
      {
        $setOnInsert: {
          partido: planilla.partido,
          jugador: presente.jugador,
          equipo: equipoDelPresente,
          numero: presente.numero,
          rol: presente.rol || 'jugador',
          estado: 'aceptado',
          creadoPor: uid,
        },
      },
      upsertOpts,
    );

    jugadorPartidoPorPresente.set(String(presente._id), jp._id);

    if (!presente.jugadorPartido) {
      await q(PlanillaPresente.updateOne({ _id: presente._id }, { jugadorPartido: jp._id }));
    }
  }

  // 2) Sets. Por defecto: crear los que falten, no pisar los que estén. Con selección:
  //    - sets no elegidos: no se crea nada; las estadísticas se cuelgan de los sets oficiales
  //      que ya existan con ese número, y las de sets inexistentes se descartan.
  //    - pisarSets: un set existente toma el resultado de la planilla (sólo si la planilla
  //      trae un ganador; "pendiente" no reabre un set cerrado).
  const setPartidoPorPlanillaSet = new Map();
  let setsCreados = 0;
  let setsPisados = 0;
  if (planilla.modo === 'sets') {
    const existentePorNumero = new Map(
      (await q(SetPartido.find({ partido: planilla.partido }))).map((x) => [x.numeroSet, x]),
    );
    for (const ps of sets) {
      const esFinalizado = ps.ganadorSet && ps.ganadorSet !== 'pendiente';
      const existente = existentePorNumero.get(ps.numeroSet);

      if (existente) {
        if (sel.incluirSets && sel.pisarSets.has(ps.numeroSet) && esFinalizado && existente.ganadorSet !== ps.ganadorSet) {
          existente.ganadorSet = ps.ganadorSet;
          existente.estadoSet = 'finalizado';
          await existente.save(opts);
          setsPisados += 1;
        }
        setPartidoPorPlanillaSet.set(String(ps._id), existente._id);
        if (!ps.setPartido) await q(PlanillaSet.updateOne({ _id: ps._id }, { setPartido: existente._id }));
        continue;
      }
      if (!sel.incluirSets) continue;

      setsCreados += 1;
      const setDoc = await SetPartido.findOneAndUpdate(
        { partido: planilla.partido, numeroSet: ps.numeroSet },
        {
          $setOnInsert: {
            partido: planilla.partido,
            numeroSet: ps.numeroSet,
            ganadorSet: ps.ganadorSet || 'pendiente',
            estadoSet: esFinalizado ? 'finalizado' : 'en_juego',
            creadoPor: uid,
          },
        },
        upsertOpts,
      );

      setPartidoPorPlanillaSet.set(String(ps._id), setDoc._id);

      if (!ps.setPartido) {
        await q(PlanillaSet.updateOne({ _id: ps._id }, { setPartido: setDoc._id }));
      }
    }
  }

  // 2b) Video: cámaras, tiempo de cada set, alineación y marcas (ver trasladarCaptura).
  const captura = await trasladarCaptura({ planilla, sets, setPartidoPorPlanillaSet, incluirSets: sel.incluirSets, uid, q, opts });

  // 3) Estadísticas. Acá sí se sobreescribe: es exactamente lo que se aprobó.
  for (const stat of estadisticas) {
    const jugadorPartidoId = jugadorPartidoPorPresente.get(String(stat.planillaPresente));
    if (!jugadorPartidoId) continue;

    const presente = presentes.find((p) => String(p._id) === String(stat.planillaPresente));
    if (!presente) continue;
    // Mismo criterio que en la convocatoria: el equipo es del presente, no de la planilla.
    const equipoDeLaFila = presente.equipo || planilla.equipo;

    if (planilla.modo === 'sets') {
      const setId = setPartidoPorPlanillaSet.get(String(stat.planillaSet));
      if (!setId) continue;

      await EstadisticasJugadorSet.findOneAndUpdate(
        { set: setId, jugadorPartido: jugadorPartidoId },
        {
          set: setId,
          jugadorPartido: jugadorPartidoId,
          jugador: presente.jugador,
          equipo: equipoDeLaFila,
          throws: stat.throws || 0,
          hits: stat.hits || 0,
          outs: stat.outs || 0,
          catches: stat.catches || 0,
          survive: Boolean(stat.survive),
          estadoPublicacion: visibilidad,
          visibilidadObjetivo: visibilidad,
          solicitudPublicacion: solicitudId,
          creadoPor: planilla.creadoPor,
        },
        upsertOpts,
      );
    } else {
      await EstadisticasJugadorPartidoManual.findOneAndUpdate(
        { jugadorPartido: jugadorPartidoId },
        {
          jugadorPartido: jugadorPartidoId,
          throws: stat.throws || 0,
          hits: stat.hits || 0,
          outs: stat.outs || 0,
          catches: stat.catches || 0,
          fuente: 'planilla-equipo',
          ultimaActualizacion: new Date(),
          estadoPublicacion: visibilidad,
          visibilidadObjetivo: visibilidad,
          solicitudPublicacion: solicitudId,
          creadoPor: planilla.creadoPor,
        },
        upsertOpts,
      );
    }

    jugadorPartidosARecalcular.add(String(jugadorPartidoId));
  }

  // 4) Modo de estadísticas del partido.
  //
  // La captura directa escribe en EstadisticasJugadorPartidoManual, pero la vista del
  // partido elige la fuente con `modoEstadisticas`, que viene en 'automatico' por
  // defecto. Sin este paso la oficialización guardaba bien y no se veía nada: había que
  // ir a cambiar el modo a mano sin ninguna pista de que hacía falta.
  //
  // Solo se cambia si el partido no tiene estadísticas automáticas propias: si las
  // tiene, la fuente actual es una decisión de la organización y no la pisamos.
  if (planilla.modo === 'directa' && jugadorPartidosARecalcular.size > 0) {
    const consulta = EstadisticasJugadorSet.countDocuments({
      jugadorPartido: { $in: [...jugadorPartidosARecalcular] },
      estadoPublicacion: { $ne: 'rechazada' },
    });
    const tieneAutomaticas = await (session ? consulta.session(session) : consulta);

    if (!tieneAutomaticas) {
      // updateOne y no doc.save(): Partido tiene un post('save') que, en partidos
      // finalizados, recalcula el marcador desde los sets y reescribe la tabla de
      // posiciones. Cambiar el modo de visualización no debe disparar nada de eso.
      await Partido.updateOne(
        { _id: planilla.partido },
        { modoEstadisticas: 'manual' },
        opts,
      );
    }
  }

  planilla.estado = 'oficializada';
  planilla.visibilidadObjetivo = visibilidad;
  if (solicitudId) planilla.solicitudOficializacion = solicitudId;
  await planilla.save(opts);

  const ids = [...jugadorPartidosARecalcular];

  // Sin sesión manejamos el recálculo acá mismo: no hay transacción esperando commit.
  if (!session) {
    for (const jugadorPartidoId of ids) {
      await recalcularAgregadosDeJugadorPartido(jugadorPartidoId, uid);
    }
  }

  // Crear o pisar sets deja el marcador del partido viejo: el caller lo recalcula tras commitear.
  const marcadorDesactualizado = setsCreados + setsPisados > 0;
  if (!session && marcadorDesactualizado) await recalcularMarcadorDelPartido(partidoId);

  return { jugadorPartidosARecalcular: ids, partidoId, equipoId, setsCreados, setsPisados, marcadorDesactualizado, resumen: sel.resumen, captura };
}

const mismosTramos = (a = [], b = []) =>
  a.length === b.length && a.every((t, i) => t.d === b[i].d && t.cam?.[0] === b[i].cam?.[0] && t.cam?.[1] === b[i].cam?.[1]);

/**
 * Lo capturado con video en la planilla pasa al partido, con la misma regla que los sets:
 * se completa lo que falta y lo oficial que ya existe no se pisa.
 *
 *  - Cámaras: las de la planilla que el partido no tiene se suman (por youtubeId); si el partido
 *    no tenía `videoUrl`, toma la principal. Una cámara que ya está no se toca.
 *  - Tiempo y alineación de cada set: sólo si el set oficial no los tiene.
 *  - Marcas: sólo si el set oficial no tiene ninguna (mezclar dos capturas da una línea de vivos
 *    sin sentido).
 *
 * Tiempos y marcas están en segundos de partido según los relojes de la PLANILLA. Si una cámara
 * que comparten está alineada distinto en el partido, esos segundos no significan lo mismo allá:
 * en ese caso no se trasladan (`relojesDistintos`) y lo resuelve una persona. La alineación no
 * depende del reloj y se copia igual.
 */
async function trasladarCaptura({ planilla, sets, setPartidoPorPlanillaSet, incluirSets, uid, q, opts }) {
  const out = { camarasAgregadas: 0, tiemposCopiados: 0, alineacionesCopiadas: 0, marcasCopiadas: 0, relojesDistintos: false };
  const propias = (planilla.videos || []).map((v) => (v.toObject ? v.toObject() : v));
  const partido = await q(Partido.findById(planilla.partido).select('videos videoUrl')).lean();
  const delPartido = partido?.videos || [];

  if (propias.length) {
    const porId = new Map(delPartido.map((v) => [v.youtubeId, v]));
    out.relojesDistintos = propias.some((v) => porId.has(v.youtubeId) && !mismosTramos(v.tramos, porId.get(v.youtubeId).tramos));
    // Si el partido ya tiene cámaras y ninguna coincide, no hay forma de saber que los relojes cuadren.
    if (delPartido.length && !propias.some((v) => porId.has(v.youtubeId))) out.relojesDistintos = true;
    const nuevas = propias.filter((v) => !porId.has(v.youtubeId)).map(({ _id, ...v }) => v);
    if (nuevas.length) {
      const $set = { videos: [...delPartido, ...nuevas] };
      if (!partido.videoUrl) $set.videoUrl = `https://www.youtube.com/watch?v=${(delPartido[0] || nuevas[0]).youtubeId}`;
      // updateOne: el post('save') de Partido recalcula marcador y tabla, y esto no lo amerita.
      await Partido.updateOne({ _id: planilla.partido }, { $set }, { runValidators: true, ...opts });
      out.camarasAgregadas = nuevas.length;
    }
  }
  if (!incluirSets) return out;

  for (const ps of sets) {
    const setId = setPartidoPorPlanillaSet.get(String(ps._id));
    if (!setId) continue;
    const oficial = await q(SetPartido.findById(setId).select('tiempo alineacion')).lean();
    const $set = {};
    if (ps.tiempo && !oficial?.tiempo && !out.relojesDistintos) {
      $set.tiempo = ps.tiempo;
      out.tiemposCopiados += 1;
    }
    if (ps.alineacion?.length && !oficial?.alineacion?.length) {
      $set.alineacion = ps.alineacion;
      out.alineacionesCopiadas += 1;
    }
    if (Object.keys($set).length) await SetPartido.updateOne({ _id: setId }, { $set }, opts);

    if (out.relojesDistintos || (await q(EventoSet.exists({ setPartido: setId })))) continue;
    const marcas = await q(EventoSet.find({ planillaSet: ps._id })).lean();
    if (!marcas.length) continue;
    await EventoSet.insertMany(
      marcas.map(({ _id, createdAt, updatedAt, __v, ...m }) => ({ ...m, planillaSet: null, setPartido: setId, creadoPor: m.creadoPor || uid })),
      opts,
    );
    out.marcasCopiadas += marcas.length;
  }
  return out;
}

/**
 * El marcador del partido no se recalcula solo al crear sets: sólo al finalizar el partido o
 * con PUT /partidos/:id/recalcular-marcador. Una oficialización que crea sets lo deja en 0 a 0
 * con todos los sets ganados. Se llama después de commitear (recalcularMarcador hace su propio
 * save, fuera de la transacción). Respeta un marcador cargado a mano. Si falla, no deshace
 * nada: los sets ya están y el marcador se puede recalcular desde el partido.
 */
export async function recalcularMarcadorDelPartido(partidoId) {
  try {
    const partido = await Partido.findById(partidoId);
    if (partido) await partido.recalcularMarcador();
  } catch (e) {
    console.error('No se pudo recalcular el marcador tras oficializar', partidoId, e.message);
  }
}
