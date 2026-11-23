/**
 * Guarda en cada Partido la duración de sus videos de YouTube (`videos[].duracion`), para que
 * Overtime TV no dependa de consultar a YouTube desde Render (que lo bloquea).
 *
 * Por partido con `videoUrl`:
 *  - Si no tiene `videos`, crea uno ("Cámara principal") con el id de `videoUrl`.
 *  - Completa `duracion` en los videos que la tengan vacía. No pisa duraciones ya cargadas.
 * Correrlo desde una PC (no desde Render), y de nuevo cuando se suban partidos con video nuevos.
 *
 * Uso (desde overtime/):
 *   node -r dotenv/config scripts/guardarDuracionesVideo.js              # sólo muestra lo que haría
 *   node -r dotenv/config scripts/guardarDuracionesVideo.js --escribir   # escribe en la base de MONGO_URI
 */
import mongoose from 'mongoose';
import Partido from '../src/models/Partido/Partido.js';
import { obtenerDuraciones, extraerYoutubeId } from '../src/services/duracionYoutubeService.js';

const ESCRIBIR = process.argv.includes('--escribir');

await mongoose.connect(process.env.MONGO_URI);
const partidos = await Partido.find({ videoUrl: { $nin: ['', null] } }).select('videoUrl videos');

const planes = [];
for (const p of partidos) {
  const videos = p.videos?.length
    ? p.videos.map((v) => v.toObject())
    : (() => {
        const id = extraerYoutubeId(p.videoUrl);
        return id ? [{ youtubeId: id, etiqueta: 'Cámara principal', duracion: null, tramos: [] }] : [];
      })();
  if (videos.some((v) => !(v.duracion > 0))) planes.push({ p, videos, nuevo: !p.videos?.length });
}

const ids = [...new Set(planes.flatMap(({ videos }) => videos.filter((v) => !(v.duracion > 0)).map((v) => v.youtubeId)))];
console.log(`${partidos.length} partidos con video, ${planes.length} con duraciones faltantes (${ids.length} videos).`);
const duraciones = await obtenerDuraciones(ids);
console.log(`YouTube devolvió duración de ${duraciones.size}/${ids.length}.`);

let escritos = 0;
for (const { p, videos, nuevo } of planes) {
  let cambio = false;
  for (const v of videos) {
    const d = duraciones.get(v.youtubeId);
    if (!(v.duracion > 0) && d) {
      v.duracion = d;
      cambio = true;
    }
  }
  if (!cambio) {
    console.log(`  ${p._id}: sin duración disponible (¿privado o borrado?)`);
    continue;
  }
  console.log(`  ${p._id}: ${nuevo ? 'crea videos' : 'completa'} → ${videos.map((v) => `${v.youtubeId}=${v.duracion ?? '?'}s`).join(', ')}`);
  if (ESCRIBIR) {
    await Partido.updateOne({ _id: p._id }, { $set: { videos } }, { runValidators: true });
    escritos++;
  }
}
console.log(ESCRIBIR ? `Escritos ${escritos} partidos.` : 'Dry-run: no se escribió nada. Usá --escribir para guardar.');
await mongoose.disconnect();
