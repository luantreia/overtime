/**
 * Importa a Overtime los videos, relojes de cámara y tiempos de set del panel de análisis
 * (realtime-cv-platform). Sólo toca partidos del panel vinculados a un Partido de Overtime
 * (`overtime.partidoId`).
 *
 * Qué escribe, por partido de Overtime:
 *  - Catálogo de videos (models/Video/Video.js, proyectado a `Partido.videos[]`): una entrada por video de YouTube con sus tramos (segundo de partido =
 *    segundo de cámara + d). Si el partido ya tiene `videos`, no se toca salvo con `--forzar`.
 *  - `Partido.videoUrl`: sólo si está vacío, con la cámara principal (la TV y la ficha lo leen).
 *  - `SetPartido.tiempo`: para los sets del panel con número, si el SetPartido existe en
 *    Overtime. NO crea sets ni toca ganadores: eso es resultado oficial y va por otro camino.
 *
 * Cómo se traduce el panel:
 *  - Cámara 1 es el partido; las demás viven en partidos "hermanos" (`canal_de`), que se
 *    saltean como partidos propios.
 *  - Una cámara puede ser la unión de varios videos de YouTube en un archivo local
 *    (`joined_from`, con `offset_s`). Los tramos del reloj están en segundos de ese archivo, así
 *    que se parten por pedazo: cam' = cam − offset, d' = d + offset.
 *  - Los sets del panel (`partido.sets`, tipo "set") están en segundos del video de cámara 1;
 *    se pasan a segundos de partido con el reloj de cámara 1.
 *
 * Uso (desde overtime/):
 *   node -r dotenv/config scripts/importarVideosPanel.js                 # sólo muestra lo que haría
 *   node -r dotenv/config scripts/importarVideosPanel.js --escribir      # escribe en la base de MONGO_URI
 *   ... --forzar         reemplaza `videos` aunque el partido ya tenga
 *   ... --panel <ruta>   carpeta de realtime-cv-platform
 *   ... --partido <id>   sólo ese Partido de Overtime
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import Partido from '../src/models/Partido/Partido.js';
import SetPartido from '../src/models/Partido/SetPartido.js';
import { obtenerDuraciones } from '../src/services/duracionYoutubeService.js';
import { reemplazarVideosPartido, fijarVideoPrincipal } from '../src/services/videoCatalogoService.js';

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : null;
};
const ESCRIBIR = process.argv.includes('--escribir');
const FORZAR = process.argv.includes('--forzar');
const SOLO = arg('--partido');
const PANEL = arg('--panel') || 'C:/Users/Nahum/Documents/Va/realtime-cv-platform';
const DIR_PARTIDOS = path.join(PANEL, 'services/control-panel/data/partidos');
const DIR_SKELETON = path.join(PANEL, 'services/cv-worker/replay_data/skeleton');

const leer = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const r1 = (x) => Math.round(x * 10) / 10;

const partidosPanel = new Map(
  fs.readdirSync(DIR_PARTIDOS).filter((f) => f.endsWith('.json')).map((f) => {
    const p = leer(path.join(DIR_PARTIDOS, f));
    return [p.id, p];
  }),
);

/** Cámaras del partido como [{ id: 'c1', etiqueta, video (entrada de `videos` del panel) }]. */
function camarasDe(p) {
  const vids = p.videos || [];
  const porId = (pp, id) => (pp.videos || []).find((v) => v.id === id) || null;
  const skel = leer(path.join(DIR_SKELETON, `${p.id}.sets.json`)) || {};

  if (Array.isArray(p.canales) && p.canales.length) {
    return p.canales.map((c) => {
      const dueño = c.id === 'c1' ? p : partidosPanel.get(c.partido) || p;
      return { id: c.id, etiqueta: c.nombre, video: porId(dueño, c.video) || porId(p, c.video) };
    });
  }

  const tomados = new Set();
  const otras = (p.camaras || [])
    .filter((c) => c.partido && c.rol !== 'camara 1')
    .map((c, i) => {
      const sp = partidosPanel.get(c.partido);
      if (!sp) return null;
      const vid = (leer(path.join(DIR_SKELETON, `${sp.id}.sets.json`)) || {}).video_id
        || ((sp.videos || []).find((v) => v.overview) || {}).id;
      const propio = vids.find((v) => v.otra_camara === sp.id) || vids.find((v) => v.id === vid);
      if (propio) tomados.add(propio.id);
      return { id: `c${i + 2}`, etiqueta: c.rol || `Cámara ${i + 2}`, video: propio || porId(sp, vid) };
    })
    .filter(Boolean);
  const usables = vids.filter((v) => v.overview && !v.joined_into && !v.alineado_a && !v.otra_camara && !tomados.has(v.id));
  const v1 = vids.find((v) => v.id === skel.video_id) || usables[0] || vids.find((v) => v.youtubeId) || null;
  return [{ id: 'c1', etiqueta: 'Cámara principal', video: v1 }, ...otras];
}

/** Pedazos de YouTube de una cámara: [{ youtubeId, offset, duracion|null, etiqueta }]. */
function pedazosDe(p, video) {
  if (!video) return [];
  if (video.youtubeId) return [{ youtubeId: video.youtubeId, offset: 0, duracion: null, etiqueta: '' }];
  if (Array.isArray(video.joined_from)) {
    return video.joined_from
      .map((j) => {
        const src = (p.videos || []).find((v) => v.id === j.videoId)
          || [...partidosPanel.values()].flatMap((x) => x.videos || []).find((v) => v.id === j.videoId);
        return src?.youtubeId
          ? { youtubeId: src.youtubeId, offset: j.offset_s, duracion: j.duration_s, etiqueta: j.label || '' }
          : null;
      })
      .filter(Boolean);
  }
  return [];
}

/** Parte los tramos de un archivo (unido o no) en tramos de cada pedazo de YouTube. */
function tramosDelPedazo(tramos, pz) {
  const fin = pz.duracion != null ? pz.offset + pz.duracion : Infinity;
  return tramos
    .map((t) => ({ a: Math.max(t.cam[0], pz.offset), b: Math.min(t.cam[1], fin), d: t.d }))
    .filter((t) => t.b - t.a >= 1)
    .map((t) => ({ cam: [r1(t.a - pz.offset), r1(t.b - pz.offset)], d: r1(t.d + pz.offset) }));
}

/** Segundo de cámara → segundo de partido con los tramos de esa cámara. */
const aPartido = (tramos, s) => {
  if (!tramos.length) return s;
  const t = tramos.find((x) => s >= x.cam[0] && s <= x.cam[1])
    || tramos.reduce((m, x) => (Math.abs(x.cam[0] - s) < Math.abs(m.cam[0] - s) ? x : m));
  return s + t.d;
};

function planDe(p) {
  const reloj = leer(path.join(DIR_SKELETON, `${p.id}.reloj.json`))?.camaras || {};
  const avisos = [];
  const videos = [];

  for (const cam of camarasDe(p)) {
    const pedazos = pedazosDe(p, cam.video);
    if (!pedazos.length) {
      avisos.push(`${cam.etiqueta}: sin video de YouTube`);
      continue;
    }
    const tramos = reloj[cam.id];
    if (!tramos && cam.id !== 'c1') {
      // Sin reloj no se sabe cómo se alinea con cámara 1: mejor no inventar d = 0.
      avisos.push(`${cam.etiqueta}: sin reloj, no se importa`);
      continue;
    }
    for (const pz of pedazos) {
      const etiqueta = [cam.etiqueta, pz.etiqueta].filter(Boolean).join(' · ');
      const propios = tramos ? tramosDelPedazo(tramos, pz) : pz.offset ? [{ cam: [0, pz.duracion ?? 1e9], d: pz.offset }] : [];
      videos.push({ youtubeId: pz.youtubeId, etiqueta, duracion: pz.duracion ? Math.round(pz.duracion) : null, tramos: propios });
    }
  }

  const tramosC1 = reloj.c1 || [];
  const sets = (p.sets || [])
    .filter((s) => s.tipo === 'set' && s.start_s != null && s.end_s != null)
    .map((s) => {
      const n = Number(/(\d+)/.exec(s.nombre || '')?.[1]);
      if (!n) return null;
      const desde = r1(aPartido(tramosC1, s.start_s));
      const hasta = r1(aPartido(tramosC1, s.end_s));
      return {
        numeroSet: n,
        tiempo: { desde, hasta, origen: s.origen === 'esqueleto' ? 'cv' : 'manual', confirmado: !!s.confirmado },
      };
    })
    .filter(Boolean);

  return { videos, sets, avisos };
}

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('Falta MONGO_URI. Corré con: node -r dotenv/config scripts/importarVideosPanel.js');
  await mongoose.connect(process.env.MONGO_URI);

  const vinculados = [...partidosPanel.values()].filter(
    (p) => p.overtime?.partidoId && !p.canal_de && (!SOLO || p.overtime.partidoId === SOLO),
  );
  const planes = vinculados.map((p) => ({ p, ...planDe(p) }));

  // Duraciones de YouTube que falten (desde esta máquina YouTube responde).
  const sinDuracion = planes.flatMap((x) => x.videos).filter((v) => v.duracion == null).map((v) => v.youtubeId);
  const duraciones = await obtenerDuraciones(sinDuracion);
  planes.forEach((x) => x.videos.forEach((v) => {
    if (v.duracion == null) v.duracion = duraciones.get(v.youtubeId) ?? null;
  }));

  const tot = { partidos: 0, videos: 0, videoUrl: 0, sets: 0, setsSinOficial: 0, saltados: 0, noEncontrados: 0 };
  for (const { p, videos, sets, avisos } of planes) {
    const ot = await Partido.findById(p.overtime.partidoId).select('videos videoUrl').lean();
    console.log(`\n■ ${p.nombre}  →  ${p.overtime.partidoId}`);
    if (!ot) {
      console.log('  ✗ el Partido no existe en esta base');
      tot.noEncontrados++;
      continue;
    }
    avisos.forEach((a) => console.log(`  ! ${a}`));

    const cambios = {};
    if (videos.length && (!ot.videos?.length || FORZAR)) {
      cambios.videos = videos;
      videos.forEach((v) => console.log(
        `  + video ${v.youtubeId} "${v.etiqueta}" ${v.duracion ? `${Math.round(v.duracion / 60)} min` : 'duración ?'} · ` +
        (v.tramos.length ? v.tramos.map((t) => `[${t.cam[0]}–${t.cam[1]}] d=${t.d}`).join(' ') : 'd=0'),
      ));
    } else if (ot.videos?.length) {
      console.log(`  = ya tiene ${ot.videos.length} video(s); se deja (usar --forzar para reemplazar)`);
      tot.saltados++;
    }
    if (!ot.videoUrl && videos[0]) {
      cambios.videoUrl = `https://www.youtube.com/watch?v=${videos[0].youtubeId}`;
      console.log(`  + videoUrl ${cambios.videoUrl}`);
    }

    const oficiales = await SetPartido.find({ partido: ot._id }).select('numeroSet tiempo').lean();
    const porNumero = new Map(oficiales.map((s) => [s.numeroSet, s]));
    const opsSets = [];
    for (const s of sets) {
      const of = porNumero.get(s.numeroSet);
      const t = s.tiempo;
      const txt = `set ${s.numeroSet}: ${t.desde}–${t.hasta}s (${t.origen}${t.confirmado ? ', confirmado' : ''})`;
      if (!of) {
        console.log(`  · ${txt} — no hay SetPartido oficial, queda afuera`);
        tot.setsSinOficial++;
        continue;
      }
      if (of.tiempo && !FORZAR) continue;
      console.log(`  + ${txt}`);
      opsSets.push({ updateOne: { filter: { _id: of._id }, update: { $set: { tiempo: t } } } });
    }

    if (Object.keys(cambios).length || opsSets.length) tot.partidos++;
    tot.videos += cambios.videos?.length ?? 0;
    tot.videoUrl += cambios.videoUrl ? 1 : 0;
    tot.sets += opsSets.length;

    if (ESCRIBIR) {
      // SetPartido con bulkWrite directo: el pre('save') recalcula resultados y rating, y esto no los cambia.
      // Los videos van al catálogo (models/Video/Video.js), que rearma Partido.videos/videoUrl.
      if (cambios.videos) await reemplazarVideosPartido(ot._id, cambios.videos);
      else if (cambios.videoUrl) await fijarVideoPrincipal(ot._id, cambios.videoUrl);
      if (opsSets.length) await SetPartido.bulkWrite(opsSets);
    }
  }

  console.log(`\n${ESCRIBIR ? 'ESCRITO' : 'SIMULACIÓN (nada escrito; usar --escribir)'}`);
  console.log(
    `  partidos con cambios: ${tot.partidos} · videos: ${tot.videos} · videoUrl nuevos: ${tot.videoUrl} · ` +
    `tiempos de set: ${tot.sets} · sets sin oficial: ${tot.setsSinOficial} · ya tenían videos: ${tot.saltados} · ` +
    `no encontrados: ${tot.noEncontrados}`,
  );
  await mongoose.disconnect();
};

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
