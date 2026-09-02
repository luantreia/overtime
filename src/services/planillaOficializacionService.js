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
//   1. Cada planilla escribe estadísticas SOLO de sus propios jugadores. La partición
//      es natural: un PlanillaPresente pertenece al equipo dueño de la planilla.
//   2. Los sets y la convocatoria se CREAN, nunca se sobreescriben. Si ya existen, la
//      planilla los referencia y deja su contenido intacto: el resultado de un set
//      sigue siendo del organizador aunque la planilla del equipo diga otra cosa.
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';
import PlanillaPresente from '../models/Equipo/PlanillaPresente.js';
import PlanillaSet from '../models/Equipo/PlanillaSet.js';
import PlanillaEstadistica from '../models/Equipo/PlanillaEstadistica.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import SetPartido from '../models/Partido/SetPartido.js';
import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';
import EstadisticasJugadorPartidoManual from '../models/Jugador/EstadisticasJugadorPartidoManual.js';
import { recalcularAgregadosDeJugadorPartido } from '../utils/estadisticasAggregator.js';

/**
 * @param {object} params
 * @param {string} params.planillaId
 * @param {'organizacion'|'publica'} params.visibilidad
 * @param {string} params.uid quien ejecuta (aprobador, o el propio equipo en amistoso)
 * @param {string} [params.solicitudId]
 * @param {import('mongoose').ClientSession} [params.session]
 * @returns {Promise<{ jugadorPartidosARecalcular: string[], partidoId: string }>}
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

  // 1) Convocatoria. Se crea solo lo que falta; una fila oficial existente no se toca.
  const jugadorPartidoPorPresente = new Map();
  for (const presente of presentes) {
    const jp = await JugadorPartido.findOneAndUpdate(
      { partido: planilla.partido, jugador: presente.jugador },
      {
        $setOnInsert: {
          partido: planilla.partido,
          jugador: presente.jugador,
          equipo: planilla.equipo,
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

  // 2) Sets. Mismo criterio: crear los que falten, no pisar los que estén.
  const setPartidoPorPlanillaSet = new Map();
  if (planilla.modo === 'sets') {
    for (const ps of sets) {
      const esFinalizado = ps.ganadorSet && ps.ganadorSet !== 'pendiente';
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

  // 3) Estadísticas. Acá sí se sobreescribe: es exactamente lo que se aprobó.
  for (const stat of estadisticas) {
    const jugadorPartidoId = jugadorPartidoPorPresente.get(String(stat.planillaPresente));
    if (!jugadorPartidoId) continue;

    const presente = presentes.find((p) => String(p._id) === String(stat.planillaPresente));
    if (!presente) continue;

    if (planilla.modo === 'sets') {
      const setId = setPartidoPorPlanillaSet.get(String(stat.planillaSet));
      if (!setId) continue;

      await EstadisticasJugadorSet.findOneAndUpdate(
        { set: setId, jugadorPartido: jugadorPartidoId },
        {
          set: setId,
          jugadorPartido: jugadorPartidoId,
          jugador: presente.jugador,
          equipo: planilla.equipo,
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

  return { jugadorPartidosARecalcular: ids, partidoId, equipoId };
}
