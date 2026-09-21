// scripts/backfill-planilla-presente-equipo.js
//
// PlanillaPresente ahora tiene un campo `equipo` (ver src/models/Equipo/PlanillaPresente.js):
// de qué plantel sale ese presente, no necesariamente el dueño de la planilla — necesario desde
// que una planilla puede capturar también al rival (o, en modo scouting, a los dos equipos de un
// partido ajeno).
//
// Los documentos existentes no tienen ese campo. Antes de este cambio la única opción era que un
// presente fuera del equipo dueño de su planilla, así que ese es el valor correcto para todos los
// documentos viejos: se resuelve `PlanillaPresente.planilla -> PlanillaEquipo.equipo` y se copia.
//
// Idempotente: sólo toca documentos con `equipo` inexistente, así que se puede reintentar sin
// riesgo si se corta a mitad de camino.
//
// USO
//   node -r dotenv/config scripts/backfill-planilla-presente-equipo.js
//   node -r dotenv/config scripts/backfill-planilla-presente-equipo.js --commit

import mongoose from 'mongoose';

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const COMMIT = process.argv.includes('--commit');
const LOTE = 500;

async function principal() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error(c.err('Falta MONGO_URI. Corré con: node -r dotenv/config scripts/backfill-planilla-presente-equipo.js'));
    process.exit(1);
  }

  await mongoose.connect(uri);

  const PlanillaPresente = (await import('../src/models/Equipo/PlanillaPresente.js')).default;
  const PlanillaEquipo = (await import('../src/models/Equipo/PlanillaEquipo.js')).default;

  const pendientes = await PlanillaPresente.find({ equipo: { $exists: false } })
    .select('_id planilla')
    .lean();

  if (pendientes.length === 0) {
    console.log(c.ok('✓ No hay PlanillaPresente sin equipo. Ya se puede pasar el campo a required: true.'));
    await mongoose.disconnect();
    return;
  }

  console.log(c.bold(`${pendientes.length} presente(s) sin equipo.\n`));

  const planillaIds = [...new Set(pendientes.map((p) => String(p.planilla)))];
  const planillas = new Map(
    (await PlanillaEquipo.find({ _id: { $in: planillaIds } }).select('equipo').lean()).map((pl) => [
      String(pl._id),
      pl.equipo,
    ])
  );

  const huerfanos = pendientes.filter((p) => !planillas.has(String(p.planilla)));
  if (huerfanos.length > 0) {
    console.log(
      c.warn(`⚠ ${huerfanos.length} presente(s) cuya planilla ya no existe — quedan sin tocar, no bloquean el flip a required.`)
    );
  }

  const aActualizar = pendientes.filter((p) => planillas.has(String(p.planilla)));

  if (!COMMIT) {
    console.log(c.warn(`Simulación: se actualizarían ${aActualizar.length} documento(s). Volvé a correr con --commit para aplicar.`));
    await mongoose.disconnect();
    return;
  }

  let hechos = 0;
  for (let i = 0; i < aActualizar.length; i += LOTE) {
    const lote = aActualizar.slice(i, i + LOTE);
    const ops = lote.map((p) => ({
      updateOne: {
        filter: { _id: p._id, equipo: { $exists: false } },
        update: { $set: { equipo: planillas.get(String(p.planilla)) } },
      },
    }));
    const resultado = await PlanillaPresente.bulkWrite(ops, { ordered: false });
    hechos += resultado.modifiedCount ?? 0;
    console.log(c.dim(`  ... ${Math.min(i + LOTE, aActualizar.length)}/${aActualizar.length}`));
  }

  console.log(c.ok(`\n✓ ${hechos} presente(s) actualizados.`));

  const restantes = await PlanillaPresente.countDocuments({ equipo: { $exists: false } });
  if (restantes === 0) {
    console.log(c.ok('✓ No queda ningún PlanillaPresente sin equipo — ya se puede pasar el campo a required: true.'));
  } else {
    console.log(c.warn(`⚠ Quedan ${restantes} sin equipo (planillas huérfanas). Revisar antes de pasar a required: true.`));
  }

  await mongoose.disconnect();
}

principal().catch(async (error) => {
  console.error(c.err('Error:'), error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
