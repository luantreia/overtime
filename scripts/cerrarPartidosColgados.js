// Corrige los partidos que quedaron en `en_juego` tras el Torneo Nacional (oct-2026).
//
// - MORAN vs PCH (6accff0224f27232840b7dde): tiene los 12 sets de una planilla oficializada
//   antes de d02ee0f, pero un marcador 0-0 marcado como manual. Se apaga el flag, se recalcula
//   desde los sets y se finaliza (el post('save') de Partido actualiza la tabla de la fase).
// - El resto de `en_juego` sin ningún set y sin actividad hace más de 7 días vuelve a `programado`.
//
// Uso:
//   node -r dotenv/config scripts/cerrarPartidosColgados.js            # muestra, no escribe
//   node -r dotenv/config scripts/cerrarPartidosColgados.js --commit   # aplica

import mongoose from 'mongoose';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Partido from '../src/models/Partido/Partido.js';
import SetPartido from '../src/models/Partido/SetPartido.js';

// Los hooks de save de Partido usan Fase, ParticipacionFase, etc.: se registran todos los modelos.
const cargar = async (dir) => {
  for (const n of readdirSync(dir)) {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) await cargar(ruta);
    else if (n.endsWith('.js')) await import(pathToFileURL(ruta).href);
  }
};
await cargar('src/models');

const COMMIT = process.argv.includes('--commit');
const A_FINALIZAR = '6accff0224f27232840b7dde';
const UNA_SEMANA = 7 * 24 * 3600e3;

await mongoose.connect(process.env.MONGO_URI);
console.log(COMMIT ? '== MODO COMMIT ==' : '== SIMULACIÓN (usar --commit para aplicar) ==');

const colgados = await Partido.find({ estado: 'en_juego' });
for (const p of colgados) {
  const id = String(p._id);
  const sets = await SetPartido.countDocuments({ partido: p._id });
  const viejo = Date.now() - new Date(p.updatedAt).getTime() > UNA_SEMANA;

  if (id === A_FINALIZAR) {
    console.log(`[finalizar] ${id} marcador ${p.marcadorLocal}-${p.marcadorVisitante}, ${sets} sets`);
    if (COMMIT) {
      p.marcadorModificadoManualmente = false;
      await p.recalcularMarcador();
      p.estado = 'finalizado';
      await p.save();
      console.log(`   -> finalizado ${p.marcadorLocal}-${p.marcadorVisitante}`);
    }
  } else if (sets === 0 && viejo) {
    console.log(`[programado] ${id} (sin sets, última actividad ${p.updatedAt.toISOString()})`);
    if (COMMIT) await Partido.updateOne({ _id: p._id }, { estado: 'programado' });
  } else {
    console.log(`[sin tocar] ${id} sets=${sets} updatedAt=${p.updatedAt.toISOString()}`);
  }
}

await mongoose.disconnect();
