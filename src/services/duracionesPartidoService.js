import Video from '../models/Video/Video.js';
import { obtenerDuraciones, extraerYoutubeId } from './duracionYoutubeService.js';
import { asegurarEnCatalogo, proyectarEnPartido } from './videoCatalogoService.js';

/**
 * Duración de los videos, guardada en el catálogo (`Video.duracion`) y proyectada a
 * `Partido.videos`. Overtime TV la necesita para armar la grilla y, desde Render, YouTube
 * suele bloquear la consulta: por eso se guarda una vez en vez de pedirla en cada visita.
 *
 * Se completa sola al cargar o cambiar un video y cuando la TV consigue una duración que
 * faltaba. Lo que YouTube no devuelva desde el servidor queda para
 * scripts/guardarDuracionesVideo.js, que se corre desde una PC.
 */

/**
 * Las cámaras de un partido viejo (forma embebida), con las duraciones que se conocen. Puro.
 * Un partido viejo sólo con `videoUrl` pasa a tener una cámara "Cámara principal".
 * No pisa duraciones ya cargadas. → { videos, cambio, nuevo, faltan: youtubeId[] }
 */
export function videosConDuracion(partido, duraciones = new Map()) {
  const nuevo = !partido.videos?.length;
  const base = nuevo
    ? (() => {
        const id = extraerYoutubeId(partido.videoUrl);
        return id ? [{ youtubeId: id, etiqueta: 'Cámara principal', duracion: null, tramos: [] }] : [];
      })()
    : partido.videos.map((v) => (v.toObject ? v.toObject() : { ...v }));
  let cambio = false;
  const faltan = [];
  for (const v of base) {
    if (v.duracion > 0) continue;
    const d = duraciones.get(v.youtubeId);
    if (d > 0) {
      v.duracion = d;
      cambio = true;
    } else {
      faltan.push(v.youtubeId);
    }
  }
  return { videos: base, cambio, nuevo, faltan };
}

/** Los youtubeId sin duración de un partido (incluido el de `videoUrl` si no tiene `videos`). */
export const idsSinDuracion = (partido) => videosConDuracion(partido).faltan;

/**
 * Completa las duraciones faltantes del catálogo: de los videos de esos partidos, o de todo el
 * catálogo si `partidoIds` es null. Después rearma los partidos tocados. Cada video se escribe
 * por separado: uno que falla no frena al resto.
 * → { revisados, escritos, sinDuracion: [{ partidoId, videoId, faltan }], errores, planes, consultados, obtenidos }
 */
export async function completarDuraciones(partidoIds = null, { escribir = true } = {}) {
  if (partidoIds && escribir) for (const id of partidoIds) await asegurarEnCatalogo(id);
  const filtro = { $or: [{ duracion: null }, { duracion: { $lte: 0 } }] };
  if (partidoIds) filtro.partido = { $in: partidoIds };
  const pendientes = await Video.find(filtro).select('youtubeId partido').lean();
  const ids = [...new Set(pendientes.map((v) => v.youtubeId))];
  const duraciones = ids.length ? await obtenerDuraciones(ids) : new Map();

  const out = {
    revisados: pendientes.length, escritos: 0, sinDuracion: [], errores: [], planes: [],
    consultados: ids.length, obtenidos: [...duraciones.values()].filter((d) => d > 0).length,
  };
  const tocados = new Set();
  for (const v of pendientes) {
    const d = duraciones.get(v.youtubeId);
    const partidoId = v.partido ? String(v.partido) : null;
    if (!(d > 0)) {
      out.sinDuracion.push({ partidoId, videoId: String(v._id), faltan: [v.youtubeId] });
      continue;
    }
    out.planes.push({ partidoId, videoId: String(v._id), youtubeId: v.youtubeId, duracion: d });
    if (!escribir) continue;
    try {
      await Video.updateOne({ _id: v._id }, { $set: { duracion: d } });
      out.escritos += 1;
      if (partidoId) tocados.add(partidoId);
    } catch (e) {
      out.errores.push({ partidoId, error: e.message });
    }
  }
  for (const id of tocados) {
    await proyectarEnPartido(id).catch((e) => out.errores.push({ partidoId: id, error: e.message }));
  }
  return out;
}

/**
 * Lo mismo para un partido, sin esperar ni romper nada: para llamar después de guardar un video.
 * Si YouTube no responde desde el servidor, queda para el script.
 */
export function completarDuracionesEnSegundoPlano(partidoId) {
  completarDuraciones([partidoId]).catch((e) =>
    console.error('[duraciones] no se pudieron completar', String(partidoId), e.message));
}

/** Duración de videos sueltos del catálogo (sin partido), en segundo plano. */
export function completarDuracionesDeVideos(videoIds) {
  (async () => {
    const vs = await Video.find({ _id: { $in: videoIds }, duracion: null }).select('youtubeId').lean();
    if (!vs.length) return;
    const dur = await obtenerDuraciones(vs.map((v) => v.youtubeId));
    for (const v of vs) {
      if (dur.get(v.youtubeId) > 0) await Video.updateOne({ _id: v._id }, { $set: { duracion: dur.get(v.youtubeId) } });
    }
  })().catch((e) => console.error('[duraciones] videos sueltos', e.message));
}
