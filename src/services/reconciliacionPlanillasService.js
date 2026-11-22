// services/reconciliacionPlanillasService.js
//
// Reconciliación de un partido por parte de la organización: pone lado a lado todas las
// versiones que existen del partido (lo oficial y cada planilla que la organización puede
// ver) y deja publicar una versión combinada eligiendo, por cada equipo, qué fuente manda.
//
// Decisiones de alcance (ver la conversación de diseño en el commit):
//
//   - La granularidad es POR EQUIPO, no por jugador: cada planilla suele ser la buena para
//     su propio plantel, y mezclar jugador por jugador entre planillas en modo sets obliga
//     a cruzar sets de fuentes distintas. La edición fila por fila queda para después.
//   - Los ganadores de set NO se sobrescriben. Cambiar un set reescribe el marcador y la
//     tabla de posiciones, y eso ya tiene su propio flujo (`resultadoPartido`). Acá se
//     muestran las diferencias de sets como información y se crean sólo los que faltan.
//   - Las estadísticas SÍ se sobrescriben — es el sentido de reconciliar — pero sólo con
//     confirmación explícita cuando ya había filas oficiales (ver `publicarReconciliacion`).
//
// El resultado se guarda como una PlanillaEquipo de tipo 'organizacion' (una por partido),
// que queda como registro de qué se publicó y desde qué fuentes, y se aplica con el mismo
// servicio de oficialización que usan las planillas de equipo.
import mongoose from 'mongoose';
import Partido from '../models/Partido/Partido.js';
import Competencia from '../models/Competencia/Competencia.js';
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';
import PlanillaPresente from '../models/Equipo/PlanillaPresente.js';
import PlanillaSet from '../models/Equipo/PlanillaSet.js';
import PlanillaEstadistica from '../models/Equipo/PlanillaEstadistica.js';
import SetPartido from '../models/Partido/SetPartido.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';
import EstadisticasJugadorPartidoManual from '../models/Jugador/EstadisticasJugadorPartidoManual.js';
import SolicitudEdicion from '../models/SolicitudEdicion.js';
import { hasCompetenciaPermission } from './competenciaPermissionService.js';
import { hasMatchPermission } from './matchPermissionService.js';
import { puedeAccederPlanilla, eliminarPlanillaEnCascada } from './planillaEquipoService.js';
import { aplicarPlanillaOficializada } from './planillaOficializacionService.js';
import { recalcularAgregadosDeJugadorPartido } from '../utils/estadisticasAggregator.js';

const { Types } = mongoose;

export const FUENTE_OFICIAL = 'oficial';
const CONTADORES = ['throws', 'hits', 'outs', 'catches'];
const ceros = () => ({ throws: 0, hits: 0, outs: 0, catches: 0 });

const sumarEn = (acc, fila) => {
  for (const c of CONTADORES) acc[c] += Number(fila?.[c]) || 0;
  return acc;
};

const mismosTotales = (a, b) => CONTADORES.every((c) => (a?.[c] || 0) === (b?.[c] || 0));

// ─── Parte pura ──────────────────────────────────────────────────────────────

/**
 * Normaliza una planilla (con presentes, sets y estadísticas) a la forma común de
 * fuente: totales por jugador y ganador por número de set.
 */
export function fuenteDesdePlanilla(planilla) {
  const presentePorId = new Map(planilla.presentes.map((p) => [String(p._id), p]));
  const porJugador = {};

  for (const p of planilla.presentes) {
    const jugadorId = String(p.jugador?._id || p.jugador);
    porJugador[jugadorId] = {
      equipo: String(p.equipo?._id || p.equipo || planilla.equipo?._id || planilla.equipo || ''),
      numero: p.numero ?? null,
      totales: ceros(),
    };
  }
  for (const e of planilla.estadisticas) {
    const p = presentePorId.get(String(e.planillaPresente));
    if (!p) continue;
    sumarEn(porJugador[String(p.jugador?._id || p.jugador)].totales, e);
  }

  const sets = {};
  if (planilla.modo === 'sets') {
    for (const s of planilla.sets) sets[s.numeroSet] = s.ganadorSet;
  }

  return {
    id: String(planilla._id),
    tipo: 'planilla',
    tipoDuenio: planilla.tipoDuenio || 'equipo',
    equipoDuenio: planilla.equipo ? String(planilla.equipo?._id || planilla.equipo) : null,
    estado: planilla.estado,
    modo: planilla.modo,
    porJugador,
    sets,
  };
}

/**
 * Compara todas las fuentes jugador por jugador y set por set.
 *
 * Un jugador "difiere" cuando dos fuentes que lo tienen dan totales distintos, o cuando
 * aparece en unas y no en otras (`ausenteEn`): que un jugador falte en una planilla es
 * justamente el tipo de discrepancia que la organización tiene que ver.
 *
 * @param {{ fuentes: ReturnType<typeof fuenteDesdePlanilla>[] }} p
 */
export function compararFuentes({ fuentes }) {
  const jugadores = new Map();
  for (const f of fuentes) {
    for (const [jugadorId, dato] of Object.entries(f.porJugador)) {
      if (!jugadores.has(jugadorId)) jugadores.set(jugadorId, { jugador: jugadorId, equipo: dato.equipo, valores: {} });
      jugadores.get(jugadorId).valores[f.id] = dato.totales;
    }
  }

  const filas = [...jugadores.values()].map((fila) => {
    const presentes = Object.values(fila.valores);
    const ausenteEn = fuentes.map((f) => f.id).filter((id) => !(id in fila.valores));
    const distintos = presentes.some((v) => !mismosTotales(v, presentes[0]));
    return { ...fila, ausenteEn, difiere: distintos || ausenteEn.length > 0 };
  });

  const numerosDeSet = [...new Set(fuentes.flatMap((f) => Object.keys(f.sets).map(Number)))].sort((a, b) => a - b);
  const sets = numerosDeSet.map((numeroSet) => {
    const valores = {};
    for (const f of fuentes) if (numeroSet in f.sets) valores[f.id] = f.sets[numeroSet];
    const distintos = new Set(Object.values(valores));
    return { numeroSet, valores, difiere: distintos.size > 1 || Object.keys(valores).length < fuentes.length };
  });

  return {
    jugadores: filas,
    sets,
    hayDiferencias: filas.some((f) => f.difiere) || sets.some((s) => s.difiere),
  };
}

/**
 * Arma el contenido de la planilla combinada a partir de la fuente elegida para cada
 * equipo. Los equipos que quedan en 'oficial' no aportan filas: lo oficial de ese lado
 * no se toca.
 *
 * Modo: 'sets' si todas las planillas elegidas lo están (así las filas set a set se
 * conservan); si alguna es 'directa', todo se combina en totales.
 *
 * @param {object} p
 * @param {Record<string, string>} p.fuentePorEquipo equipoId → planillaId | 'oficial'
 * @param {Record<string, object>} p.planillasPorId  planillas completas (presentes/sets/estadisticas)
 * @returns {{ modo: 'sets'|'directa', presentes: object[], sets: object[], estadisticas: object[], equiposAplicados: string[] }}
 */
export function combinarFuentes({ fuentePorEquipo, planillasPorId }) {
  const elegidas = Object.entries(fuentePorEquipo).filter(([, fuente]) => fuente && fuente !== FUENTE_OFICIAL);
  const modo = elegidas.every(([, id]) => planillasPorId[id]?.modo === 'sets') ? 'sets' : 'directa';

  const presentes = [];
  const estadisticas = [];
  const setsPorNumero = new Map();

  for (const [equipoId, planillaId] of elegidas) {
    const planilla = planillasPorId[planillaId];
    const setPorId = new Map(planilla.sets.map((s) => [String(s._id), s]));
    const equipoDelPresente = (p) => String(p.equipo?._id || p.equipo || planilla.equipo?._id || planilla.equipo || '');

    for (const p of planilla.presentes) {
      if (equipoDelPresente(p) !== String(equipoId)) continue;
      const clave = `p${presentes.length}`;
      presentes.push({
        clave,
        jugador: String(p.jugador?._id || p.jugador),
        equipo: String(equipoId),
        numero: p.numero,
        rol: p.rol || 'jugador',
        jugadorPartido: p.jugadorPartido || null,
      });

      const filas = planilla.estadisticas.filter((e) => String(e.planillaPresente) === String(p._id));
      if (modo === 'sets') {
        for (const e of filas) {
          const set = setPorId.get(String(e.planillaSet));
          if (!set) continue;
          if (!setsPorNumero.has(set.numeroSet)) setsPorNumero.set(set.numeroSet, set.ganadorSet || 'pendiente');
          estadisticas.push({ presente: clave, numeroSet: set.numeroSet, ...sumarEn(ceros(), e), survive: Boolean(e.survive) });
        }
      } else {
        estadisticas.push({ presente: clave, numeroSet: null, ...filas.reduce(sumarEn, ceros()), survive: false });
      }
    }

    if (modo === 'sets') {
      for (const s of planilla.sets) {
        if (!setsPorNumero.has(s.numeroSet)) setsPorNumero.set(s.numeroSet, s.ganadorSet || 'pendiente');
      }
    }
  }

  const sets = [...setsPorNumero.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numeroSet, ganadorSet]) => ({ numeroSet, ganadorSet }));

  return { modo, presentes, sets, estadisticas, equiposAplicados: elegidas.map(([eq]) => String(eq)) };
}

// ─── Parte con base de datos ────────────────────────────────────────────────

async function cargarPlanillaConHijos(planilla) {
  const [presentes, sets, estadisticas] = await Promise.all([
    PlanillaPresente.find({ planilla: planilla._id }).populate('jugador', 'nombre apellido alias').lean(),
    PlanillaSet.find({ planilla: planilla._id }).sort({ numeroSet: 1 }).lean(),
    PlanillaEstadistica.find({ planilla: planilla._id }).lean(),
  ]);
  return { ...planilla, presentes, sets, estadisticas };
}

/** Lo oficial del partido, en la misma forma que una fuente de planilla. */
async function cargarFuenteOficial(partido) {
  const equipos = [partido.equipoLocal?._id || partido.equipoLocal, partido.equipoVisitante?._id || partido.equipoVisitante].filter(Boolean);
  const [convocatoria, setsOficiales] = await Promise.all([
    JugadorPartido.find({ partido: partido._id, equipo: { $in: equipos } })
      .populate('jugador', 'nombre apellido alias')
      .lean(),
    SetPartido.find({ partido: partido._id }).sort({ numeroSet: 1 }).lean(),
  ]);
  const jpIds = convocatoria.map((jp) => jp._id);

  const manual = partido.modoEstadisticas === 'manual';
  const filas = jpIds.length
    ? manual
      ? await EstadisticasJugadorPartidoManual.find({ jugadorPartido: { $in: jpIds }, estadoPublicacion: { $ne: 'rechazada' } }).lean()
      : await EstadisticasJugadorSet.find({ jugadorPartido: { $in: jpIds }, estadoPublicacion: { $ne: 'rechazada' } }).lean()
    : [];

  const porJugador = {};
  const jugadoresDoc = {};
  for (const jp of convocatoria) {
    const jugadorId = String(jp.jugador?._id || jp.jugador);
    jugadoresDoc[jugadorId] = jp.jugador;
    porJugador[jugadorId] = { equipo: String(jp.equipo), numero: jp.numero ?? null, totales: ceros(), jugadorPartido: String(jp._id) };
  }
  const jpAJugador = new Map(convocatoria.map((jp) => [String(jp._id), String(jp.jugador?._id || jp.jugador)]));
  for (const f of filas) {
    const jugadorId = jpAJugador.get(String(f.jugadorPartido));
    if (jugadorId) sumarEn(porJugador[jugadorId].totales, f);
  }

  const sets = {};
  for (const s of setsOficiales) sets[s.numeroSet] = s.ganadorSet;

  return {
    fuente: { id: FUENTE_OFICIAL, tipo: 'oficial', modo: manual ? 'directa' : 'sets', porJugador, sets },
    jugadoresDoc,
    filasOficialesPorJugador: Object.fromEntries(
      Object.entries(porJugador).map(([jugadorId, d]) => [jugadorId, filas.filter((f) => String(f.jugadorPartido) === d.jugadorPartido).length]),
    ),
  };
}

/**
 * ¿Puede este usuario publicar la versión reconciliada? Es decidir lo oficial del
 * partido: admin global, creador/administradores del partido, o quien aprueba partidos
 * en la competencia. Las asignaciones puntuales (planilleros) no alcanzan.
 */
export async function esAutoridadDelPartido(partido, usuario) {
  if ((usuario?.rol || '').toLowerCase() === 'admin') return true;
  const uid = String(usuario?.uid || '');
  if (!uid) return false;
  if (String(partido.creadoPor || '') === uid) return true;
  if ((partido.administradores || []).some((a) => String(a) === uid)) return true;
  if (!partido.competencia) return false;
  return hasCompetenciaPermission({
    competenciaId: String(partido.competencia?._id || partido.competencia),
    usuarioId: uid,
    rolGlobal: usuario.rol,
    permission: 'matches.approve',
  });
}

/**
 * Todo lo que necesita la vista de reconciliación de un partido.
 * Sólo entran las planillas que el usuario puede leer completas (el resolver ya deja
 * afuera los borradores de los equipos).
 */
export async function obtenerReconciliacion(partidoId, usuario) {
  if (!Types.ObjectId.isValid(partidoId)) return { status: 400, error: 'partido inválido' };

  const partido = await Partido.findById(partidoId)
    .select('equipoLocal equipoVisitante competencia estado fecha modoEstadisticas creadoPor administradores')
    .populate('equipoLocal', 'nombre escudo')
    .populate('equipoVisitante', 'nombre escudo')
    .lean();
  if (!partido) return { status: 404, error: 'Partido no encontrado' };

  const puedeVer = await hasMatchPermission({
    partidoId: String(partido._id),
    usuarioId: usuario?.uid,
    rolGlobal: usuario?.rol,
    permission: 'match.view_private',
  });
  if (!puedeVer) return { status: 403, error: 'No tenés permisos sobre este partido' };

  const candidatas = await PlanillaEquipo.find({ partido: partido._id })
    .select('partido equipo jugador organizacion tipoDuenio estado modo solicitudOficializacion updatedAt')
    .populate('equipo', 'nombre escudo')
    .lean();

  const visibles = [];
  for (const pl of candidatas) {
    const acceso = await puedeAccederPlanilla({
      planilla: { ...pl, equipo: pl.equipo?._id || pl.equipo },
      usuario,
      accion: 'leer',
    });
    if (acceso.permitido && !acceso.ocultarNotas) visibles.push(pl);
  }

  const completas = await Promise.all(visibles.map(cargarPlanillaConHijos));
  const oficial = await cargarFuenteOficial(partido);
  const fuentes = [oficial.fuente, ...completas.map(fuenteDesdePlanilla)];

  // Nombres de jugador desde cualquier fuente que los tenga populados.
  const nombres = { ...oficial.jugadoresDoc };
  for (const pl of completas) for (const p of pl.presentes) if (p.jugador?._id) nombres[String(p.jugador._id)] = p.jugador;

  const comparacion = compararFuentes({ fuentes });

  return {
    status: 200,
    data: {
      partido,
      puedePublicar: await esAutoridadDelPartido(partido, usuario),
      fuentes: fuentes.map((f) => {
        const pl = completas.find((c) => String(c._id) === f.id);
        return {
          id: f.id,
          tipo: f.tipo,
          tipoDuenio: f.tipoDuenio || null,
          equipoDuenio: pl?.equipo ? { _id: String(pl.equipo._id || pl.equipo), nombre: pl.equipo.nombre } : null,
          estado: f.estado || null,
          modo: f.modo,
          actualizada: pl?.updatedAt || null,
        };
      }),
      jugadores: comparacion.jugadores.map((fila) => ({
        ...fila,
        jugador: nombres[fila.jugador] || { _id: fila.jugador },
        filasOficiales: oficial.filasOficialesPorJugador[fila.jugador] || 0,
      })),
      sets: comparacion.sets,
      hayDiferencias: comparacion.hayDiferencias,
    },
  };
}

/**
 * Publica la versión reconciliada.
 *
 * Doble paso para sobrescribir: si algún equipo elegido ya tiene estadísticas oficiales,
 * la primera llamada (sin `confirmarSobrescritura`) no escribe nada y devuelve 409 con
 * el detalle de qué se reemplazaría. La UI lo muestra y reenvía con la confirmación.
 *
 * Las solicitudes de oficialización pendientes de las planillas del partido se cierran:
 * la de una planilla usada como fuente queda aceptada, la de una no usada queda
 * rechazada con motivo. Si quedaran abiertas, aprobar una después pisaría lo reconciliado.
 *
 * @param {object} p
 * @param {string} p.partidoId
 * @param {Record<string,string>} p.fuentePorEquipo  equipoId → planillaId | 'oficial'
 * @param {'organizacion'|'publica'} p.visibilidad
 * @param {boolean} [p.confirmarSobrescritura]
 * @param {{ uid: string, rol?: string }} p.usuario
 */
export async function publicarReconciliacion({ partidoId, fuentePorEquipo = {}, visibilidad, confirmarSobrescritura = false, usuario }) {
  const lectura = await obtenerReconciliacion(partidoId, usuario);
  if (lectura.status !== 200) return lectura;
  const { partido, puedePublicar, jugadores } = lectura.data;
  if (!puedePublicar) return { status: 403, error: 'Sólo quien administra el partido o la competencia puede publicar la reconciliación' };

  const equiposDelPartido = [partido.equipoLocal?._id, partido.equipoVisitante?._id].filter(Boolean).map(String);
  const fuentesVisibles = new Set(lectura.data.fuentes.filter((f) => f.tipo === 'planilla' && f.tipoDuenio !== 'organizacion').map((f) => f.id));

  for (const [equipoId, fuente] of Object.entries(fuentePorEquipo)) {
    if (!equiposDelPartido.includes(String(equipoId))) {
      return { status: 400, error: 'Uno de los equipos elegidos no juega este partido' };
    }
    if (fuente !== FUENTE_OFICIAL && !fuentesVisibles.has(String(fuente))) {
      return { status: 400, error: 'Una de las fuentes elegidas no es una planilla visible de este partido' };
    }
  }

  const planillaIds = [...new Set(Object.values(fuentePorEquipo).filter((f) => f !== FUENTE_OFICIAL))];
  if (!planillaIds.length) return { status: 400, error: 'Elegí al menos un equipo cuya planilla reemplace lo oficial' };

  const planillasPorId = {};
  for (const id of planillaIds) {
    planillasPorId[id] = await cargarPlanillaConHijos(await PlanillaEquipo.findById(id).lean());
  }
  const combinada = combinarFuentes({ fuentePorEquipo, planillasPorId });
  if (!combinada.presentes.length) {
    return { status: 400, error: 'Las planillas elegidas no tienen jugadores de esos equipos' };
  }

  // Qué filas oficiales se reemplazan, para la confirmación.
  const jugadoresCombinados = new Set(combinada.presentes.map((p) => p.jugador));
  const reemplazos = jugadores
    .filter((f) => jugadoresCombinados.has(String(f.jugador._id || f.jugador)) && f.filasOficiales > 0)
    .map((f) => ({ jugador: f.jugador, equipo: f.equipo, antes: f.valores[FUENTE_OFICIAL] || null }));

  // Avisos que no bloquean pero que la organización tiene que saber.
  const avisos = [];
  if (combinada.modo === 'directa' && partido.modoEstadisticas !== 'manual' && reemplazos.length) {
    avisos.push('El partido muestra estadísticas por set y la versión reconciliada es de totales: no se va a ver hasta que cambies el modo de estadísticas del partido a manual.');
  }
  const setsDistintos = lectura.data.sets.filter((s) => s.difiere).map((s) => s.numeroSet);
  if (setsDistintos.length) {
    avisos.push(`Los ganadores de set no se modifican desde acá (sets con diferencias: ${setsDistintos.join(', ')}). Si el resultado está mal, corregilo desde el partido.`);
  }

  if (reemplazos.length && !confirmarSobrescritura) {
    return { status: 409, error: 'Hay estadísticas oficiales que se van a reemplazar', data: { requiereConfirmacion: true, reemplazos, avisos } };
  }

  const competencia = partido.competencia
    ? await Competencia.findById(partido.competencia).select('organizacion').lean()
    : null;
  if (!competencia?.organizacion) {
    return { status: 400, error: 'El partido no pertenece a una competencia con organización: no hay a nombre de quién reconciliar' };
  }

  const session = await mongoose.startSession();
  let resultado;
  let planillaOrgId;
  try {
    await session.withTransaction(async () => {
      // Una sola planilla de organización por partido: reconciliar de nuevo la rehace.
      const previa = await PlanillaEquipo.findOne({ partido: partido._id, tipoDuenio: 'organizacion', organizacion: competencia.organizacion })
        .session(session)
        .select('_id')
        .lean();
      if (previa) await eliminarPlanillaEnCascada(previa._id, session);

      const [planillaOrg] = await PlanillaEquipo.create([{
        partido: partido._id,
        tipoDuenio: 'organizacion',
        organizacion: competencia.organizacion,
        modo: combinada.modo,
        estado: 'borrador',
        visibilidadObjetivo: visibilidad,
        notas: `Reconciliación: ${Object.entries(fuentePorEquipo).map(([eq, f]) => `${eq}←${f}`).join(', ')}`,
        creadoPor: usuario.uid,
      }], { session });
      planillaOrgId = planillaOrg._id;

      const presentesDocs = await PlanillaPresente.insertMany(combinada.presentes.map((p) => ({
        planilla: planillaOrg._id,
        jugador: p.jugador,
        equipo: p.equipo,
        numero: p.numero,
        rol: p.rol,
        jugadorPartido: p.jugadorPartido,
        creadoPor: usuario.uid,
      })), { session });
      const presentePorClave = new Map(combinada.presentes.map((p, i) => [p.clave, presentesDocs[i]._id]));

      const setsDocs = combinada.modo === 'sets'
        ? await PlanillaSet.insertMany(combinada.sets.map((s) => ({ planilla: planillaOrg._id, numeroSet: s.numeroSet, ganadorSet: s.ganadorSet, creadoPor: usuario.uid })), { session })
        : [];
      const setPorNumero = new Map(setsDocs.map((s) => [s.numeroSet, s._id]));

      await PlanillaEstadistica.insertMany(combinada.estadisticas.map((e) => ({
        planilla: planillaOrg._id,
        planillaPresente: presentePorClave.get(e.presente),
        planillaSet: e.numeroSet == null ? null : setPorNumero.get(e.numeroSet),
        throws: e.throws, hits: e.hits, outs: e.outs, catches: e.catches, survive: e.survive,
        creadoPor: usuario.uid,
      })), { session });

      resultado = await aplicarPlanillaOficializada({ planillaId: planillaOrg._id, visibilidad, uid: usuario.uid, session });

      // Cerrar las solicitudes pendientes de las planillas de equipo del partido.
      const pendientes = await PlanillaEquipo.find({ partido: partido._id, tipoDuenio: { $ne: 'organizacion' }, estado: 'pendiente_oficializacion' })
        .session(session)
        .select('_id solicitudOficializacion')
        .lean();
      for (const pl of pendientes) {
        const usada = planillaIds.includes(String(pl._id));
        await PlanillaEquipo.updateOne({ _id: pl._id }, { estado: usada ? 'oficializada' : 'rechazada' }, { session });
        if (pl.solicitudOficializacion) {
          await SolicitudEdicion.updateOne(
            { _id: pl.solicitudOficializacion, estado: 'pendiente' },
            usada
              ? { estado: 'aceptado', $addToSet: { aceptadoPor: usuario.uid }, fechaAceptacion: new Date() }
              : { estado: 'rechazado', motivoRechazo: 'La organización reconcilió el partido usando otra fuente para este equipo.', fechaRechazo: new Date() },
            { session },
          );
        }
      }
    });
  } finally {
    await session.endSession();
  }

  for (const jpId of resultado.jugadorPartidosARecalcular) {
    await recalcularAgregadosDeJugadorPartido(jpId, usuario.uid);
  }

  return {
    status: 200,
    data: {
      planillaOrganizacion: String(planillaOrgId),
      modo: combinada.modo,
      equiposAplicados: combinada.equiposAplicados,
      reemplazos: reemplazos.length,
      avisos,
    },
  };
}
