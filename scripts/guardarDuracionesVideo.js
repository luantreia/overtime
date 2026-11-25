/**
 * Guarda en cada Partido la duración de sus videos de YouTube (`videos[].duracion`), para que
 * Overtime TV no dependa de consultar a YouTube desde Render (que lo bloquea).
 *
 * El backend ya las completa solo al cargar un video (services/duracionesPartidoService.js),
 * pero desde Render YouTube puede no responder: este script es para lo que haya quedado
 * pendiente. Correrlo desde una PC, no desde Render.
 *
 * Por partido con `videoUrl`:
 *  - Si no tiene `videos`, crea uno ("Cámara principal") con el id de `videoUrl`.
 *  - Completa `duracion` en los videos que la tengan vacía. No pisa duraciones ya cargadas.
 *  - Cada partido se escribe por separado: si uno falla, se informa y se sigue con el resto.
 *
 * Uso (desde overtime/):
 *   node -r dotenv/config scripts/guardarDuracionesVideo.js              # sólo muestra lo que haría
 *   node -r dotenv/config scripts/guardarDuracionesVideo.js --escribir   # escribe en la base de MONGO_URI
 */
import mongoose from 'mongoose';
import { completarDuraciones } from '../src/services/duracionesPartidoService.js';

const ESCRIBIR = process.argv.includes('--escribir');

await mongoose.connect(process.env.MONGO_URI);
console.log(`Base: ${mongoose.connection.host}/${mongoose.connection.name}`);
const r = await completarDuraciones(null, { escribir: ESCRIBIR });

console.log(`${r.revisados} partidos con video, ${r.planes.length + r.sinDuracion.length} con duraciones faltantes (${r.consultados} videos).`);
console.log(`YouTube devolvió duración de ${r.obtenidos}/${r.consultados}.`);
if (r.consultados && !r.obtenidos) {
  console.log('⚠ YouTube no devolvió ninguna: probablemente bloqueó esta conexión. Probá más tarde o cargá YOUTUBE_API_KEY.');
}
for (const p of r.planes) {
  console.log(`  ${p.partidoId}: ${p.nuevo ? 'crea videos' : 'completa'} → ${p.videos.map((v) => `${v.youtubeId}=${v.duracion ?? '?'}s`).join(', ')}`);
}
for (const s of r.sinDuracion) console.log(`  ${s.partidoId}: sin duración disponible para ${s.faltan.join(', ')} (¿privado o borrado?)`);
for (const e of r.errores) console.log(`  ✗ ${e.partidoId}: ${e.error}`);
console.log(
  ESCRIBIR
    ? `Escritos ${r.escritos} partidos${r.errores.length ? `, ${r.errores.length} con error` : ''}.`
    : 'Dry-run: no se escribió nada. Usá --escribir para guardar.',
);
await mongoose.disconnect();
