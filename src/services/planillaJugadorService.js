// services/planillaJugadorService.js
//
// "Mis números": la planilla de un jugador sobre sus propios partidos.
//
// Reglas de fondo:
//   - El jugador carga SÓLO sus filas, y sólo en totales (modo 'directa'): nadie recuerda
//     sus números set por set, y desglosar sin datos sería inventar precisión.
//   - Sólo partidos de un equipo con el que tenía contrato vigente a la fecha del partido.
//   - Nunca escribe en lo oficial. Lo más lejos que llega es el APORTE: ofrecerle los
//     números al cuerpo técnico, que los acepta (se copian a la planilla del equipo y desde
//     ahí siguen el flujo normal de oficialización) o los descarta.
import mongoose from 'mongoose';
import Partido from '../models/Partido/Partido.js';
import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';
import EstadisticasJugadorPartidoManual from '../models/Jugador/EstadisticasJugadorPartidoManual.js';
import PlanillaEquipo from '../models/Equipo/PlanillaEquipo.js';
import PlanillaPresente from '../models/Equipo/PlanillaPresente.js';
import PlanillaEstadistica from '../models/Equipo/PlanillaEstadistica.js';
import { hasTeamPermission } from './teamPermissionService.js';
import {
  usuarioEsJugador,
  puedeAccederPlanilla,
  planillaEstaCerrada,
  eliminarPlanillaEnCascada,
} from './planillaEquipoService.js';

const { Types } = mongoose;
const CONTADORES = ['throws', 'hits', 'outs', 'catches'];
const ceros = () => ({ throws: 0, hits: 0, outs: 0, catches: 0 });
const sumarEn = (acc, fila) => {
  for (const c of CONTADORES) acc[c] += Number(fila?.[c]) || 0;
  return acc;
};

/** Estados de partido sobre los que tiene sentido cargar números. */
const ESTADOS_PARTIDO_CARGABLES = new Set(['en_juego', 'finalizado']);

// ─── Parte pura ──────────────────────────────────────────────────────────────

/**
 * ¿El contrato estaba vigente en esa fecha? Misma regla que el resto del backend:
 * `estado` y fechas son ejes distintos.
 */
export function contratoVigenteEn(contrato, fecha) {
  if (!contrato || contrato.estado !== 'aceptado') return false;
  const t = new Date(fecha).getTime();
  if (contrato.desde && new Date(contrato.desde).getTime() > t) return false;
  if (contrato.hasta && new Date(contrato.hasta).getTime() < t) return false;
  return true;
}

/**
 * De qué equipo jugó el jugador en este partido, según sus contratos. `null` si no
 * tenía contrato vigente con ninguno de los dos. Si (caso raro) lo tenía con los dos,
 * gana el local — es arbitrario, pero estable.
 */
export function equipoDelJugadorEnPartido(partido, contratos) {
  for (const lado of [partido.equipoLocal, partido.equipoVisitante]) {
    const id = String(lado?._id || lado || '');
    if (!id) continue;
    if (contratos.some((c) => String(c.equipo?._id || c.equipo) === id && contratoVigenteEn(c, partido.fecha))) return id;
  }
  return null;
}

/** Valida y normaliza los cuatro contadores que manda el cliente. */
export function normalizarNumeros(body = {}) {
  const out = {};
  for (const c of CONTADORES) {
    const v = body[c] === undefined || body[c] === '' ? 0 : Number(body[c]);
    if (!Number.isInteger(v) || v < 0 || v > 999) return { ok: false, message: `${c} tiene que ser un entero entre 0 y 999` };
    out[c] = v;
  }
  return { ok: true, numeros: out };
}

// ─── Parte con base de datos ────────────────────────────────────────────────

async function contratosDe(jugadorId) {
  return JugadorEquipo.find({ jugador: jugadorId, estado: 'aceptado' }).select('equipo desde hasta estado').lean();
}

/** Carga la planilla de jugador y valida que el usuario sea su dueño. */
async function cargarPropia(planillaId, usuario) {
  if (!Types.ObjectId.isValid(planillaId)) return { status: 400, error: 'planilla inválida' };
  const planilla = await PlanillaEquipo.findById(planillaId);
  if (!planilla || planilla.tipoDuenio !== 'jugador') return { status: 404, error: 'Planilla no encontrada' };
  const { permitido } = await puedeAccederPlanilla({ planilla, usuario, accion: 'editar' });
  if (!permitido) return { status: 403, error: 'Esta planilla no es tuya' };
  return { status: 200, planilla };
}

/**
 * Partidos sobre los que el jugador puede abrir su planilla: los de sus equipos, con
 * contrato vigente a la fecha, jugados o en juego, y que todavía no tienen planilla suya.
 */
export async function partidosDisponibles(jugadorId, usuario, { limite = 60 } = {}) {
  if (!Types.ObjectId.isValid(jugadorId)) return { status: 400, error: 'jugador inválido' };
  if (!(await usuarioEsJugador(jugadorId, usuario.uid)) && usuario.rol !== 'admin') {
    return { status: 403, error: 'No administrás este jugador' };
  }

  const contratos = await contratosDe(jugadorId);
  const equipos = [...new Set(contratos.map((c) => String(c.equipo)))];
  if (!equipos.length) return { status: 200, data: [] };

  const [partidos, propias] = await Promise.all([
    Partido.find({
      estado: { $in: [...ESTADOS_PARTIDO_CARGABLES] },
      $or: [{ equipoLocal: { $in: equipos } }, { equipoVisitante: { $in: equipos } }],
    })
      .select('fecha estado equipoLocal equipoVisitante marcadorLocal marcadorVisitante competencia')
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .sort({ fecha: -1 })
      .limit(limite * 2)
      .lean(),
    PlanillaEquipo.find({ tipoDuenio: 'jugador', jugador: jugadorId }).select('partido').lean(),
  ]);
  const conPlanilla = new Set(propias.map((p) => String(p.partido)));

  const data = partidos
    .filter((p) => !conPlanilla.has(String(p._id)))
    .map((p) => ({ ...p, miEquipo: equipoDelJugadorEnPartido(p, contratos) }))
    .filter((p) => p.miEquipo)
    .slice(0, limite);

  return { status: 200, data };
}

/** Abre la planilla del jugador para un partido, con su presente y una fila en cero. */
export async function crearPlanillaJugador({ partidoId, jugadorId, usuario }) {
  if (!Types.ObjectId.isValid(partidoId) || !Types.ObjectId.isValid(jugadorId)) {
    return { status: 400, error: 'partido o jugador inválido' };
  }
  if (!(await usuarioEsJugador(jugadorId, usuario.uid)) && usuario.rol !== 'admin') {
    return { status: 403, error: 'No administrás este jugador' };
  }

  const partido = await Partido.findById(partidoId).select('fecha estado equipoLocal equipoVisitante').lean();
  if (!partido) return { status: 404, error: 'Partido no encontrado' };
  if (!ESTADOS_PARTIDO_CARGABLES.has(partido.estado)) {
    return { status: 409, error: 'Sólo se cargan números de partidos jugados o en juego' };
  }

  const equipo = equipoDelJugadorEnPartido(partido, await contratosDe(jugadorId));
  if (!equipo) return { status: 403, error: 'No tenías contrato con ninguno de los dos equipos a la fecha del partido' };

  const existente = await PlanillaEquipo.findOne({ partido: partidoId, jugador: jugadorId, tipoDuenio: 'jugador' }).select('_id').lean();
  if (existente) return { status: 409, error: 'Ya tenés tu planilla de este partido', data: { planillaId: existente._id } };

  const planilla = await PlanillaEquipo.create({
    partido: partidoId,
    tipoDuenio: 'jugador',
    jugador: jugadorId,
    modo: 'directa',
    creadoPor: usuario.uid,
  });
  const presente = await PlanillaPresente.create({
    planilla: planilla._id,
    jugador: jugadorId,
    equipo,
    creadoPor: usuario.uid,
  });
  await PlanillaEstadistica.create({
    planilla: planilla._id,
    planillaPresente: presente._id,
    planillaSet: null,
    creadoPor: usuario.uid,
  });

  return { status: 201, data: { planillaId: String(planilla._id), equipo } };
}

/** Guarda los totales del jugador en su propia planilla. */
export async function guardarMisNumeros({ planillaId, body, usuario }) {
  const r = await cargarPropia(planillaId, usuario);
  if (r.status !== 200) return r;
  const { planilla } = r;
  if (planilla.aporte?.estado === 'pendiente') {
    return { status: 409, error: 'Tus números están esperando que el cuerpo técnico los revise: retirá el aporte para editarlos' };
  }

  const v = normalizarNumeros(body);
  if (!v.ok) return { status: 400, error: v.message };

  const presente = await PlanillaPresente.findOne({ planilla: planilla._id }).select('_id').lean();
  if (!presente) return { status: 409, error: 'La planilla no tiene jugador cargado' };

  await PlanillaEstadistica.findOneAndUpdate(
    { planilla: planilla._id, planillaPresente: presente._id, planillaSet: null },
    { ...v.numeros, creadoPor: usuario.uid },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (body.notas !== undefined) planilla.notas = String(body.notas).slice(0, 1000);
  await planilla.save();
  return { status: 200, data: { planillaId: String(planilla._id), ...v.numeros } };
}

export async function eliminarPlanillaJugador({ planillaId, usuario }) {
  const r = await cargarPropia(planillaId, usuario);
  if (r.status !== 200) return r;
  await eliminarPlanillaEnCascada(r.planilla._id);
  return { status: 204 };
}

/** Ofrece los números al cuerpo técnico del equipo con el que jugó ese partido. */
export async function aportar({ planillaId, usuario }) {
  const r = await cargarPropia(planillaId, usuario);
  if (r.status !== 200) return r;
  const { planilla } = r;
  if (planilla.aporte?.estado === 'pendiente') return { status: 409, error: 'Ya está aportada y esperando revisión' };

  const presente = await PlanillaPresente.findOne({ planilla: planilla._id }).select('equipo').lean();
  if (!presente?.equipo) return { status: 409, error: 'No se pudo determinar tu equipo en este partido' };

  planilla.aporte = { estado: 'pendiente', equipo: presente.equipo, fecha: new Date() };
  await planilla.save();
  return { status: 200, data: { aporte: planilla.aporte } };
}

export async function retirarAporte({ planillaId, usuario }) {
  const r = await cargarPropia(planillaId, usuario);
  if (r.status !== 200) return r;
  if (r.planilla.aporte?.estado !== 'pendiente') return { status: 409, error: 'No hay un aporte pendiente para retirar' };
  r.planilla.aporte = undefined;
  await r.planilla.save();
  return { status: 200, data: { aporte: null } };
}

/** Totales oficiales del jugador por partido, respetando la fuente que muestra cada partido. */
async function oficialesPorPartido(jugadorId) {
  const convocatoria = await JugadorPartido.find({ jugador: jugadorId })
    .select('partido equipo')
    .populate('partido', 'modoEstadisticas')
    .lean();
  if (!convocatoria.length) return {};

  const ids = convocatoria.map((jp) => jp._id);
  const [porSet, manuales] = await Promise.all([
    EstadisticasJugadorSet.find({ jugadorPartido: { $in: ids }, estadoPublicacion: { $nin: ['rechazada', 'privada', 'pendiente_aprobacion'] } }).lean(),
    EstadisticasJugadorPartidoManual.find({ jugadorPartido: { $in: ids }, estadoPublicacion: { $nin: ['rechazada', 'privada', 'pendiente_aprobacion'] } }).lean(),
  ]);

  const out = {};
  for (const jp of convocatoria) {
    const manual = jp.partido?.modoEstadisticas === 'manual';
    const filas = (manual ? manuales : porSet).filter((f) => String(f.jugadorPartido) === String(jp._id));
    if (!filas.length) continue;
    out[String(jp.partido?._id || jp.partido)] = filas.reduce(sumarEn, ceros());
  }
  return out;
}

/**
 * "Mis números": por cada partido donde el jugador tiene algún dato, las tres versiones
 * que puede ver — lo oficial, la planilla de su equipo (sin notas) y la suya.
 */
export async function resumenJugador(jugadorId, usuario) {
  if (!Types.ObjectId.isValid(jugadorId)) return { status: 400, error: 'jugador inválido' };
  if (!(await usuarioEsJugador(jugadorId, usuario.uid)) && usuario.rol !== 'admin') {
    return { status: 403, error: 'No administrás este jugador' };
  }

  const [oficiales, propias, presentesEnEquipos] = await Promise.all([
    oficialesPorPartido(jugadorId),
    PlanillaEquipo.find({ tipoDuenio: 'jugador', jugador: jugadorId }).lean(),
    PlanillaPresente.find({ jugador: jugadorId }).select('planilla equipo').lean(),
  ]);

  // Mis filas en las planillas de mis equipos (sólo las que el resolver me deja leer).
  const planillasDeEquipo = await PlanillaEquipo.find({
    _id: { $in: presentesEnEquipos.map((p) => p.planilla) },
    tipoDuenio: 'equipo',
  }).select('partido equipo tipoDuenio estado modo').populate('equipo', 'nombre').lean();

  const delEquipo = {};
  for (const pl of planillasDeEquipo) {
    const acceso = await puedeAccederPlanilla({ planilla: { ...pl, equipo: pl.equipo?._id || pl.equipo }, usuario, accion: 'leer' });
    if (!acceso.permitido) continue;
    const presente = presentesEnEquipos.find((p) => String(p.planilla) === String(pl._id));
    const filas = await PlanillaEstadistica.find({ planilla: pl._id, planillaPresente: presente._id }).lean();
    delEquipo[String(pl.partido)] = {
      planillaId: String(pl._id),
      equipo: pl.equipo ? { _id: String(pl.equipo._id), nombre: pl.equipo.nombre } : null,
      estado: pl.estado,
      totales: filas.reduce(sumarEn, ceros()),
    };
  }

  const propiasPorPartido = {};
  for (const pl of propias) {
    const filas = await PlanillaEstadistica.find({ planilla: pl._id }).lean();
    propiasPorPartido[String(pl.partido)] = {
      planillaId: String(pl._id),
      totales: filas.reduce(sumarEn, ceros()),
      aporte: pl.aporte || null,
      notas: pl.notas || '',
      actualizada: pl.updatedAt,
    };
  }

  const partidoIds = [...new Set([...Object.keys(oficiales), ...Object.keys(delEquipo), ...Object.keys(propiasPorPartido)])];
  const partidos = await Partido.find({ _id: { $in: partidoIds } })
    .select('fecha estado equipoLocal equipoVisitante marcadorLocal marcadorVisitante competencia')
    .populate('equipoLocal', 'nombre escudo')
    .populate('equipoVisitante', 'nombre escudo')
    .sort({ fecha: -1 })
    .lean();

  return {
    status: 200,
    data: partidos.map((p) => ({
      partido: p,
      oficial: oficiales[String(p._id)] || null,
      equipo: delEquipo[String(p._id)] || null,
      propia: propiasPorPartido[String(p._id)] || null,
    })),
  };
}

/** Bandeja del cuerpo técnico: aportes de jugadores para su equipo. */
export async function listarAportes(equipoId, usuario, { estado = 'pendiente' } = {}) {
  if (!Types.ObjectId.isValid(equipoId)) return { status: 400, error: 'equipo inválido' };
  const puede = await hasTeamPermission({ equipoId, usuarioId: usuario.uid, rolGlobal: usuario.rol, permission: 'stats.capture' });
  if (!puede) return { status: 403, error: 'No podés capturar estadísticas de este equipo' };

  const filtro = { tipoDuenio: 'jugador', 'aporte.equipo': equipoId };
  if (estado !== 'todos') filtro['aporte.estado'] = estado;

  const aportes = await PlanillaEquipo.find(filtro)
    .populate('jugador', 'nombre apellido alias foto')
    .populate({
      path: 'partido',
      select: 'fecha estado equipoLocal equipoVisitante marcadorLocal marcadorVisitante',
      populate: [{ path: 'equipoLocal', select: 'nombre' }, { path: 'equipoVisitante', select: 'nombre' }],
    })
    .sort({ 'aporte.fecha': -1 })
    .lean();

  const data = [];
  for (const a of aportes) {
    const [filas, planillaEquipo] = await Promise.all([
      PlanillaEstadistica.find({ planilla: a._id }).lean(),
      PlanillaEquipo.findOne({ partido: a.partido?._id, equipo: equipoId, tipoDuenio: 'equipo' }).select('_id estado modo').lean(),
    ]);
    let enPlanillaDelEquipo = null;
    if (planillaEquipo) {
      const presente = await PlanillaPresente.findOne({ planilla: planillaEquipo._id, jugador: a.jugador?._id }).select('_id').lean();
      if (presente) {
        const f = await PlanillaEstadistica.find({ planilla: planillaEquipo._id, planillaPresente: presente._id }).lean();
        enPlanillaDelEquipo = f.reduce(sumarEn, ceros());
      }
    }
    data.push({
      planillaId: String(a._id),
      jugador: a.jugador,
      partido: a.partido,
      aporte: a.aporte,
      notas: a.notas || '',
      totales: filas.reduce(sumarEn, ceros()),
      planillaDelEquipo: planillaEquipo
        ? { _id: String(planillaEquipo._id), estado: planillaEquipo.estado, modo: planillaEquipo.modo, totalesDelJugador: enPlanillaDelEquipo }
        : null,
    });
  }
  return { status: 200, data };
}

/**
 * El cuerpo técnico acepta o descarta un aporte.
 *
 * Aceptar copia los totales a la planilla del equipo para ese partido:
 *   - si no hay planilla del equipo, se crea una en modo 'directa' con este jugador;
 *   - si hay una en 'directa' y editable, se agrega o reemplaza la fila del jugador;
 *   - si la del equipo es por set, o ya está cerrada (pidiendo oficializar u
 *     oficializada), no se puede: totales no se pueden repartir en sets sin inventar,
 *     y una planilla cerrada no admite cambios. El DT lo carga a mano o descarta.
 */
export async function resolverAporte({ planillaId, accion, motivo, usuario }) {
  if (!Types.ObjectId.isValid(planillaId)) return { status: 400, error: 'planilla inválida' };
  if (!['aceptar', 'descartar'].includes(accion)) return { status: 400, error: 'acción inválida' };

  const aporte = await PlanillaEquipo.findById(planillaId);
  if (!aporte || aporte.tipoDuenio !== 'jugador' || !aporte.aporte) return { status: 404, error: 'Aporte no encontrado' };
  if (aporte.aporte.estado !== 'pendiente') return { status: 409, error: 'Este aporte ya fue resuelto' };

  const equipoId = String(aporte.aporte.equipo);
  const puede = await hasTeamPermission({ equipoId, usuarioId: usuario.uid, rolGlobal: usuario.rol, permission: 'stats.capture' });
  if (!puede) return { status: 403, error: 'No podés capturar estadísticas de este equipo' };

  let planillaEquipoId = null;
  if (accion === 'aceptar') {
    const [filaAporte] = await PlanillaEstadistica.find({ planilla: aporte._id }).lean();
    const numeros = filaAporte ? Object.fromEntries(CONTADORES.map((c) => [c, filaAporte[c] || 0])) : ceros();

    let destino = await PlanillaEquipo.findOne({ partido: aporte.partido, equipo: equipoId, tipoDuenio: 'equipo' });
    if (destino && planillaEstaCerrada(destino)) {
      return { status: 409, error: 'La planilla del equipo para este partido ya está cerrada (pidiendo oficializar u oficializada)' };
    }
    if (destino && destino.modo === 'sets') {
      return { status: 409, error: 'La planilla del equipo es set a set: los totales del jugador no se pueden repartir en sets. Cargalos a mano o descartá el aporte.' };
    }
    if (!destino) {
      destino = await PlanillaEquipo.create({ partido: aporte.partido, tipoDuenio: 'equipo', equipo: equipoId, modo: 'directa', creadoPor: usuario.uid });
    }

    const presente = await PlanillaPresente.findOneAndUpdate(
      { planilla: destino._id, jugador: aporte.jugador },
      { $setOnInsert: { planilla: destino._id, jugador: aporte.jugador, equipo: equipoId, creadoPor: usuario.uid } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await PlanillaEstadistica.findOneAndUpdate(
      { planilla: destino._id, planillaPresente: presente._id, planillaSet: null },
      { ...numeros, creadoPor: usuario.uid },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    planillaEquipoId = String(destino._id);
  }

  aporte.aporte.estado = accion === 'aceptar' ? 'aceptado' : 'descartado';
  aporte.aporte.resueltoPor = usuario.uid;
  aporte.aporte.fechaResolucion = new Date();
  if (motivo) aporte.aporte.motivo = String(motivo).slice(0, 500);
  aporte.markModified('aporte');
  await aporte.save();

  return { status: 200, data: { estado: aporte.aporte.estado, planillaEquipo: planillaEquipoId } };
}

