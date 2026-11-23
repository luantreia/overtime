// Marca fechaConfirmada: false en los partidos cargados sin día definido.
//
// Antes de existir el campo, un fixture sin fecha se cargaba con una fecha de relleno
// (31-dic) y la aclaración en la jornada: "3º Fecha (fecha a confirmar)". Este script
// traduce esa convención al campo. Idempotente.
//
// Uso:
//   node -r dotenv/config scripts/marcarFechasAConfirmar.js            # muestra, no escribe
//   node -r dotenv/config scripts/marcarFechasAConfirmar.js --commit   # aplica

import mongoose from 'mongoose';
import Partido from '../src/models/Partido/Partido.js';

const COMMIT = process.argv.includes('--commit');
await mongoose.connect(process.env.MONGO_URI);

const filtro = { jornada: /a confirmar/i, fechaConfirmada: { $ne: false } };
const candidatos = await Partido.find(filtro).select('jornada estado fecha').lean();
const porEstado = {};
for (const p of candidatos) porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;
console.log(`${COMMIT ? 'Marcando' : 'Se marcarían'} ${candidatos.length} partidos`, porEstado);

if (COMMIT && candidatos.length) {
  // updateMany y no save(): no debe disparar los hooks de marcador/tabla de Partido.
  const r = await Partido.updateMany(filtro, { $set: { fechaConfirmada: false } });
  console.log('Modificados:', r.modifiedCount);
}

await mongoose.disconnect();
