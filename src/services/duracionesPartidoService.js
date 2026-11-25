import Partido from '../models/Partido/Partido.js';
import { obtenerDuraciones, extraerYoutubeId } from './duracionYoutubeService.js';

/**
 * Duración de los videos guardada en cada Partido (`videos[].duracion`). Overtime TV la necesita
 * para armar la grilla y, desde Render, YouTube suele bloquear la consulta: por eso se guarda
 * una vez en el partido en vez de pedirla en cada visita.
 *
 * Se completa sola al cargar o cambiar un video (rutas de partidos y de captura) y cuando la TV
 * consigue una duración que faltaba. Lo que YouTube no devuelva desde el servidor queda para
 * scripts/guardarDuracionesVideo.js, que se corre desde una PC.
 */

/**
 * Los videos que debería tener el partido, con las duraciones que se conocen. Puro.
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
 * Completa las duraciones faltantes de los partidos indicados (todos los que tienen video si
 * `partidoIds` es null). Cada partido se escribe por separado: uno que falla no frena al resto.
 * → { revisados, escritos, sinDuracion: [{ partidoId, faltan }], errores: [{ partidoId, error }], planes }
 */
export async function completarDuraciones(partidoIds = null, { escribir = true } = {}) {
  const filtro = { videoUrl: { $nin: ['', null] } };
  if (partidoIds) filtro._id = { $in: partidoIds };
  const partidos = await Partido.find(filtro).select('videoUrl videos').lean();
  const conFaltantes = partidos.filter((p) => idsSinDuracion(p).length > 0);
  const ids = [...new Set(conFaltantes.flatMap(idsSinDuracion))];
  const duraciones = ids.length ? await obtenerDuraciones(ids) : new Map();

  const out = { revisados: partidos.length, escritos: 0, sinDuracion: [], errores: [], planes: [], consultados: ids.length, obtenidos: [...duraciones.values()].filter((d) => d > 0).length };
  for (const p of conFaltantes) {
    const plan = videosConDuracion(p, duraciones);
    if (plan.faltan.length) out.sinDuracion.push({ partidoId: String(p._id), faltan: plan.faltan });
    if (!plan.cambio) continue;
    out.planes.push({ partidoId: String(p._id), nuevo: plan.nuevo, videos: plan.videos });
    if (!escribir) continue;
    try {
      // updateOne: el post('save') de Partido recalcula marcador y tabla, y esto no lo amerita.
      await Partido.updateOne({ _id: p._id }, { $set: { videos: plan.videos } }, { runValidators: true });
      out.escritos += 1;
    } catch (e) {
      out.errores.push({ partidoId: String(p._id), error: e.message });
    }
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
