/**
 * Guarda la duración de los videos de YouTube en el catálogo (`Video.duracion`, proyectada a
 * `Partido.videos`), para que Overtime TV no dependa de consultar a YouTube desde Render.
 * Correrlo desde una PC, no desde Render. No pisa duraciones ya cargadas.
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

console.log(`${r.revisados} videos del catálogo sin duración (${r.consultados} ids de YouTube).`);
console.log(`YouTube devolvió duración de ${r.obtenidos}/${r.consultados}.`);
if (r.consultados && !r.obtenidos) {
  console.log('⚠ YouTube no devolvió ninguna: probablemente bloqueó esta conexión. Probá más tarde o cargá YOUTUBE_API_KEY.');
}
for (const p of r.planes) {
  console.log(`  video ${p.videoId}${p.partidoId ? ` (partido ${p.partidoId})` : ''}: ${p.youtubeId}=${p.duracion}s`);
}
for (const s of r.sinDuracion) console.log(`  ${s.partidoId}: sin duración disponible para ${s.faltan.join(', ')} (¿privado o borrado?)`);
for (const e of r.errores) console.log(`  ✗ ${e.partidoId}: ${e.error}`);
console.log(
  ESCRIBIR
    ? `Escritos ${r.escritos} videos${r.errores.length ? `, ${r.errores.length} con error` : ''}.`
    : 'Dry-run: no se escribió nada. Usá --escribir para guardar.',
);
await mongoose.disconnect();
