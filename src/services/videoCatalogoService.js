import Video from '../models/Video/Video.js';
import Partido from '../models/Partido/Partido.js';
import Competencia from '../models/Competencia/Competencia.js';
import { extraerYoutubeId, extraerInicio } from './duracionYoutubeService.js';
import { videosConDuracion } from './duracionesPartidoService.js';

/**
 * Catálogo de videos (models/Video/Video.js) = la única fuente de los videos.
 *
 * Todo lo que agrega, cambia o saca videos pasa por acá, y después de cada cambio
 * `proyectarEnPartido` rearma `Partido.videos` / `Partido.videoUrl`, que las apps siguen
 * leyendo como siempre. Nadie escribe esos dos campos de Partido directo.
 *
 * Todas las funciones aceptan `{ session }` para correr dentro de una transacción.
 */

const s = (q, session) => (session ? q.session(session) : q);

export const urlDe = (v) =>
  v ? `https://www.youtube.com/watch?v=${v.youtubeId}${v.inicio > 0 ? `&t=${v.inicio}s` : ''}` : '';

/** Cámaras del partido tal como las guarda Partido.videos (sin campos del catálogo). */
const comoCamara = (v) => ({
  youtubeId: v.youtubeId,
  etiqueta: v.etiqueta || '',
  duracion: v.duracion ?? null,
  tramos: (v.tramos || []).map((t) => ({ cam: t.cam, d: t.d })),
});

/** Competencia y organización que heredan los videos de un partido. */
async function duenioDePartido(partidoId, session) {
  const p = await s(Partido.findById(partidoId).select('competencia videoUrl videos'), session).lean();
  if (!p) return null;
  let organizacion = null;
  if (p.competencia) {
    const c = await s(Competencia.findById(p.competencia).select('organizacion'), session).lean();
    organizacion = c?.organizacion ?? null;
  }
  return { partido: p, competencia: p.competencia ?? null, organizacion };
}

/**
 * Las cámaras de un partido viejo (sólo `videoUrl` / `videos` embebidos) como filas del
 * catálogo. Puro. La de `videoUrl` es la principal (orden 0) y se queda con su `t=`.
 */
export function camarasLegado(partido) {
  const { videos } = videosConDuracion(partido);
  const idPrincipal = extraerYoutubeId(partido.videoUrl);
  const inicio = extraerInicio(partido.videoUrl) || 0;
  let lista = videos.map((v) => ({ ...comoCamara(v), inicio: 0 }));
  if (idPrincipal) {
    const i = lista.findIndex((v) => v.youtubeId === idPrincipal);
    const principal = i >= 0 ? lista.splice(i, 1)[0] : { youtubeId: idPrincipal, etiqueta: 'Cámara principal', duracion: null, tramos: [] };
    lista = [{ ...principal, inicio }, ...lista];
  }
  // Un mismo youtubeId repetido no puede entrar (índice único por partido).
  const vistos = new Set();
  return lista.filter((v) => !vistos.has(v.youtubeId) && vistos.add(v.youtubeId)).map((v, orden) => ({ ...v, orden }));
}

/**
 * Si el partido todavía no tiene filas en el catálogo pero sí videos viejos embebidos, los
 * pasa al catálogo. Idempotente: con filas, no hace nada. → cantidad creada.
 */
export async function asegurarEnCatalogo(partidoId, { session } = {}) {
  if (await s(Video.exists({ partido: partidoId }), session)) return 0;
  const d = await duenioDePartido(partidoId, session);
  if (!d) return 0;
  const filas = camarasLegado(d.partido);
  if (!filas.length) return 0;
  await Video.insertMany(
    filas.map((f) => ({ ...f, partido: partidoId, competencia: d.competencia, organizacion: d.organizacion })),
    session ? { session } : {},
  );
  return filas.length;
}

/** Pasa al catálogo todos los partidos con videos viejos. Idempotente (corre al arrancar). */
export async function migrarTodoAlCatalogo() {
  const conVideo = await Partido.find({ $or: [{ videoUrl: { $nin: ['', null] } }, { 'videos.0': { $exists: true } }] })
    .select('_id').lean();
  const yaEstan = new Set((await Video.distinct('partido', { partido: { $ne: null } })).map(String));
  let partidos = 0;
  let videos = 0;
  for (const { _id } of conVideo) {
    if (yaEstan.has(String(_id))) continue;
    try {
      const n = await asegurarEnCatalogo(_id);
      if (n) { partidos += 1; videos += n; }
    } catch (e) {
      console.error('[videos] no se pudo migrar el partido', String(_id), e.message);
    }
  }
  return { partidos, videos };
}

/** Rearma Partido.videos / videoUrl desde el catálogo. → { videos, videoUrl } */
export async function proyectarEnPartido(partidoId, { session } = {}) {
  if (!partidoId) return null;
  const filas = await s(Video.find({ partido: partidoId }).sort({ orden: 1, createdAt: 1 }), session).lean();
  const $set = { videos: filas.map(comoCamara), videoUrl: urlDe(filas[0]) };
  // updateOne: el post('save') de Partido recalcula marcador y tabla, y esto no lo amerita.
  await Partido.updateOne({ _id: partidoId }, { $set }, { runValidators: true, ...(session ? { session } : {}) });
  return $set;
}

/** Deja los `orden` de las cámaras del partido en 0..n-1 respetando el orden actual. */
async function renumerar(partidoId, session) {
  const filas = await s(Video.find({ partido: partidoId }).sort({ orden: 1, createdAt: 1 }).select('_id orden'), session).lean();
  const ops = filas
    .map((f, i) => (f.orden === i ? null : { updateOne: { filter: { _id: f._id }, update: { $set: { orden: i } } } }))
    .filter(Boolean);
  if (ops.length) await Video.bulkWrite(ops, session ? { session } : {});
}

/**
 * Reemplaza las cámaras del partido por `camaras` (forma de Partido.videos), en ese orden.
 * Las que ya existían (mismo youtubeId) conservan título, `enTv` e inicio.
 */
export async function reemplazarVideosPartido(partidoId, camaras, { session, creadoPor = null } = {}) {
  const d = await duenioDePartido(partidoId, session);
  if (!d) throw Object.assign(new Error('Partido no encontrado'), { status: 404 });
  await asegurarEnCatalogo(partidoId, { session });
  const ids = camaras.map((c) => c.youtubeId);
  if (new Set(ids).size !== ids.length) throw Object.assign(new Error('Hay cámaras repetidas'), { status: 400 });
  await Video.deleteMany({ partido: partidoId, youtubeId: { $nin: ids } }, session ? { session } : {});
  for (const [orden, c] of camaras.entries()) {
    const set = { etiqueta: c.etiqueta || '', tramos: c.tramos || [], orden, competencia: d.competencia, organizacion: d.organizacion };
    if (c.duracion > 0) set.duracion = c.duracion;
    await Video.updateOne(
      { partido: partidoId, youtubeId: c.youtubeId },
      { $set: set, $setOnInsert: { creadoPor } },
      { upsert: true, runValidators: true, ...(session ? { session } : {}) },
    );
  }
  return proyectarEnPartido(partidoId, { session });
}

/** Suma cámaras al final (las que el partido ya tiene, por youtubeId, se ignoran). */
export async function agregarCamaras(partidoId, camaras, { session, creadoPor = null } = {}) {
  const d = await duenioDePartido(partidoId, session);
  if (!d) return null;
  await asegurarEnCatalogo(partidoId, { session });
  const existentes = await s(Video.find({ partido: partidoId }).select('youtubeId orden'), session).lean();
  const ya = new Set(existentes.map((v) => v.youtubeId));
  let orden = existentes.reduce((m, v) => Math.max(m, v.orden + 1), 0);
  const nuevas = camaras.filter((c) => !ya.has(c.youtubeId));
  if (nuevas.length) {
    await Video.insertMany(
      nuevas.map((c) => ({ ...comoCamara(c), orden: orden++, partido: partidoId, competencia: d.competencia, organizacion: d.organizacion, creadoPor })),
      session ? { session } : {},
    );
  }
  return proyectarEnPartido(partidoId, { session });
}

/**
 * Lo que antes era "escribir Partido.videoUrl": fija la cámara principal desde un link.
 *  - link vacío → saca la cámara principal (las demás quedan).
 *  - link de una cámara que el partido ya tiene → esa pasa a principal (con el `t=` nuevo).
 *  - link nuevo → reemplaza a la principal (o la crea si no había).
 */
export async function fijarVideoPrincipal(partidoId, link, { session, creadoPor = null } = {}) {
  const d = await duenioDePartido(partidoId, session);
  if (!d) throw Object.assign(new Error('Partido no encontrado'), { status: 404 });
  await asegurarEnCatalogo(partidoId, { session });
  const o = session ? { session } : {};
  const principal = await s(Video.findOne({ partido: partidoId }).sort({ orden: 1, createdAt: 1 }), session);

  if (!String(link || '').trim()) {
    if (principal) await Video.deleteOne({ _id: principal._id }, o);
  } else {
    const youtubeId = extraerYoutubeId(link);
    if (!youtubeId) throw Object.assign(new Error('El link no es de un video de YouTube'), { status: 400 });
    const inicio = extraerInicio(link) || 0;
    const existente = await s(Video.findOne({ partido: partidoId, youtubeId }), session);
    if (existente) {
      existente.inicio = inicio;
      existente.orden = principal && String(principal._id) !== String(existente._id) ? principal.orden - 1 : existente.orden;
      await existente.save(o);
    } else if (principal) {
      principal.set({ youtubeId, inicio, duracion: null, tramos: [] });
      await principal.save(o);
    } else {
      await Video.create([{ youtubeId, inicio, etiqueta: 'Cámara principal', partido: partidoId, orden: 0, competencia: d.competencia, organizacion: d.organizacion, creadoPor }], o);
    }
  }
  await renumerar(partidoId, session);
  return proyectarEnPartido(partidoId, { session });
}

/**
 * Cambia de lugar un video del catálogo (otro partido, o suelto con `partido: null`) y
 * proyecta los dos partidos afectados. Al entrar a un partido va al final de sus cámaras.
 */
export async function moverVideo(video, nuevoPartidoId, { session } = {}) {
  const anterior = video.partido ? String(video.partido) : null;
  const nuevo = nuevoPartidoId ? String(nuevoPartidoId) : null;
  if (anterior === nuevo) return video;
  if (nuevo) {
    const d = await duenioDePartido(nuevo, session);
    if (!d) throw Object.assign(new Error('Partido no encontrado'), { status: 404 });
    await asegurarEnCatalogo(nuevo, { session });
    if (await s(Video.exists({ partido: nuevo, youtubeId: video.youtubeId }), session)) {
      throw Object.assign(new Error('Ese partido ya tiene este video'), { status: 409 });
    }
    const ultimo = await s(Video.findOne({ partido: nuevo }).sort({ orden: -1 }).select('orden'), session).lean();
    video.set({ partido: nuevo, orden: ultimo ? ultimo.orden + 1 : 0, competencia: d.competencia, organizacion: d.organizacion ?? video.organizacion });
  } else {
    video.set({ partido: null, orden: 0, tramos: [] });
  }
  await video.save(session ? { session } : {});
  if (anterior) { await renumerar(anterior, session); await proyectarEnPartido(anterior, { session }); }
  if (nuevo) await proyectarEnPartido(nuevo, { session });
  return video;
}

/** Saca un video del catálogo y rearma su partido. */
export async function eliminarVideo(video, { session } = {}) {
  await Video.deleteOne({ _id: video._id }, session ? { session } : {});
  if (video.partido) {
    await renumerar(video.partido, session);
    await proyectarEnPartido(video.partido, { session });
  }
}

/** Pasa un video a cámara principal de su partido. */
export async function hacerPrincipal(video, { session } = {}) {
  if (!video.partido) return;
  const principal = await s(Video.findOne({ partido: video.partido }).sort({ orden: 1 }).select('orden'), session).lean();
  video.orden = (principal?.orden ?? 0) - 1;
  await video.save(session ? { session } : {});
  await renumerar(video.partido, session);
  await proyectarEnPartido(video.partido, { session });
}
