// scripts/fusionarJugadores.js
//
// Fusiona dos fichas de jugador que en realidad son la misma persona: repunta todas las
// referencias del duplicado al jugador que se conserva y después borra el duplicado.
//
// Existe porque las importaciones masivas crean fichas nuevas cuando el nombre no
// coincide exactamente con una existente, y eso parte el historial de un jugador en dos.
//
// Uso:
//   node -r dotenv/config scripts/fusionarJugadores.js --mantener <idA> --eliminar <idB>
//   ... agregar --commit para escribir. Sin el flag no toca nada.
//
// Qué hace con los índices únicos: cuando el duplicado tiene una fila que chocaría con
// una del jugador que se conserva (mismo partido, misma planilla, misma competencia),
// esa fila NO se repunta — se descarta. El script se niega a descartar cualquier fila
// que tenga datos colgando, así que si hubiera estadísticas en juego corta y avisa en
// vez de perderlas en silencio.

import mongoose from 'mongoose';

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Cada colección que apunta a un Jugador, con el campo que lo referencia y —cuando
 * existe— el otro campo del índice único, que es lo que puede chocar al fusionar.
 */
const REFERENCIAS = [
  { modelo: 'Actividad/Actividad.js', campo: 'jugador' },
  { modelo: 'Equipo/PlanillaPresente.js', campo: 'jugador', unicoCon: 'planilla' },
  { modelo: 'Jugador/EstadisticasJugadorSet.js', campo: 'jugador' },
  { modelo: 'Jugador/InvitacionJugador.js', campo: 'jugador' },
  { modelo: 'Jugador/JugadorCompetencia.js', campo: 'jugador', unicoCon: 'competencia' },
  { modelo: 'Jugador/JugadorEquipo.js', campo: 'jugador' },
  { modelo: 'Jugador/JugadorFase.js', campo: 'jugador' },
  { modelo: 'Jugador/JugadorPartido.js', campo: 'jugador', unicoCon: 'partido' },
  { modelo: 'Jugador/JugadorTemporada.js', campo: 'jugador' },
  { modelo: 'Jugador/PlayerRating.js', campo: 'playerId' },
  { modelo: 'Partido/MatchPlayer.js', campo: 'playerId' },
  { modelo: 'Partido/MatchTeam.js', campo: 'players', esArray: true },
  { modelo: 'Plaza/KarmaLog.js', campo: 'targetPlayer' },
];

/** Qué cuelga de una fila que estaríamos por descartar. */
async function dependencias(nombreModelo, doc) {
  if (nombreModelo === 'PlanillaPresente') {
    const PE = (await import('../src/models/Equipo/PlanillaEstadistica.js')).default;
    return PE.countDocuments({ planillaPresente: doc._id });
  }
  if (nombreModelo === 'JugadorPartido') {
    const EJS = (await import('../src/models/Jugador/EstadisticasJugadorSet.js')).default;
    return EJS.countDocuments({ jugadorPartido: doc._id });
  }
  return 0;
}

async function main() {
  const argv = process.argv;
  const args = { dryRun: true };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--mantener') args.mantener = argv[++i];
    else if (argv[i] === '--eliminar') args.eliminar = argv[++i];
    else if (argv[i] === '--commit') args.dryRun = false;
  }

  if (!args.mantener || !args.eliminar) {
    console.error(c.err('Uso: node -r dotenv/config scripts/fusionarJugadores.js --mantener <id> --eliminar <id> [--commit]'));
    process.exit(1);
  }
  if (String(args.mantener) === String(args.eliminar)) {
    console.error(c.err('Los dos ids son el mismo.'));
    process.exit(1);
  }
  for (const id of [args.mantener, args.eliminar]) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(c.err(`id inválido: ${id}`));
      process.exit(1);
    }
  }

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const Jugador = (await import('../src/models/Jugador/Jugador.js')).default;
    const [mantener, eliminar] = await Promise.all([
      Jugador.findById(args.mantener).lean(),
      Jugador.findById(args.eliminar).lean(),
    ]);
    if (!mantener) { console.error(c.err(`No existe el jugador a mantener: ${args.mantener}`)); process.exit(1); }
    if (!eliminar) { console.error(c.err(`No existe el jugador a eliminar: ${args.eliminar}`)); process.exit(1); }

    console.log(c.bold('\n=== Fusión de jugadores ==='));
    console.log(`Se conserva: ${c.ok(mantener.nombre)} ${c.dim(String(mantener._id))}`);
    console.log(`Se elimina:  ${c.err(eliminar.nombre)} ${c.dim(String(eliminar._id))}`);
    console.log(args.dryRun ? c.warn('\nMODO DRY-RUN — no se escribe nada\n') : c.err('\nMODO COMMIT — se va a escribir\n'));

    let totalRepuntadas = 0;
    let totalDescartadas = 0;
    const bloqueos = [];

    for (const ref of REFERENCIAS) {
      const M = (await import(`../src/models/${ref.modelo}`)).default;
      const nombre = M.modelName;

      if (ref.esArray) {
        const n = await M.countDocuments({ [ref.campo]: eliminar._id });
        if (!n) continue;
        console.log(`${nombre.padEnd(24)} ${String(n).padStart(4)} a repuntar ${c.dim('(array)')}`);
        totalRepuntadas += n;
        if (!args.dryRun) {
          await M.updateMany({ [ref.campo]: eliminar._id }, { $addToSet: { [ref.campo]: mantener._id } });
          await M.updateMany({ [ref.campo]: eliminar._id }, { $pull: { [ref.campo]: eliminar._id } });
        }
        continue;
      }

      const docs = await M.find({ [ref.campo]: eliminar._id }).lean();
      if (!docs.length) continue;

      let repuntar = docs;
      let descartar = [];

      if (ref.unicoCon) {
        const delQueSeQueda = await M.find({ [ref.campo]: mantener._id }).select(ref.unicoCon).lean();
        const ocupadas = new Set(delQueSeQueda.map((d) => String(d[ref.unicoCon])));
        descartar = docs.filter((d) => ocupadas.has(String(d[ref.unicoCon])));
        repuntar = docs.filter((d) => !ocupadas.has(String(d[ref.unicoCon])));

        // Una fila que se descarta no puede llevarse datos puestos.
        for (const d of descartar) {
          const n = await dependencias(nombre, d);
          if (n > 0) {
            bloqueos.push(`${nombre} ${d._id}: choca con una fila existente y tiene ${n} registro(s) colgando`);
          }
        }
      }

      totalRepuntadas += repuntar.length;
      totalDescartadas += descartar.length;
      console.log(
        `${nombre.padEnd(24)} ${String(repuntar.length).padStart(4)} a repuntar`
        + (descartar.length ? c.warn(`  ${descartar.length} a descartar (ya existe la equivalente)`) : ''),
      );

      if (!args.dryRun && !bloqueos.length) {
        if (descartar.length) await M.deleteMany({ _id: { $in: descartar.map((d) => d._id) } });
        if (repuntar.length) {
          await M.updateMany({ _id: { $in: repuntar.map((d) => d._id) } }, { [ref.campo]: mantener._id });
        }
      }
    }

    if (bloqueos.length) {
      console.log(c.err('\nNo se puede fusionar sin perder datos:'));
      bloqueos.forEach((b) => console.log(`  ${b}`));
      console.log(c.dim('Resolvé esas filas a mano y volvé a correr.'));
      process.exit(1);
    }

    console.log(c.bold('\n=== Resumen ==='));
    console.log(`Referencias ${args.dryRun ? 'a repuntar' : 'repuntadas'}: ${totalRepuntadas}`);
    console.log(`Filas ${args.dryRun ? 'a descartar' : 'descartadas'} por duplicado: ${totalDescartadas}`);

    if (args.dryRun) {
      console.log(c.warn('\nNo se escribió nada. Repetí con --commit.'));
    } else {
      await Jugador.deleteOne({ _id: eliminar._id });
      console.log(c.ok(`\nListo. Se eliminó la ficha de ${eliminar.nombre}.`));
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => { console.error(c.err(`\nError: ${e.message}`)); console.error(e); process.exit(1); });
