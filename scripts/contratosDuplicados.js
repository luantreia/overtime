// scripts/contratosDuplicados.js
//
// Encuentra jugadores con más de un contrato (JugadorEquipo) en el mismo equipo, y distingue
// los que son legítimos de los que son basura.
//
// POR QUÉ PUEDE PASAR
//
// `JugadorEquipo` no tiene índice único {jugador, equipo}, y con razón: un jugador puede irse
// y volver, y eso son dos contratos de verdad con períodos distintos. Pero la falta de índice
// también deja pasar duplicados que no significan nada, y hay dos caminos conocidos:
//
//   1. `fusionarJugadores.js`. Cuando dos fichas de la misma persona se fusionan y las DOS
//      tenían contrato con el mismo equipo, el script repunta las dos al jugador que queda.
//      No las detecta como choque porque sólo mira los índices únicos, y acá no hay ninguno.
//      Es el sospechoso más probable después de una importación masiva, que es justamente
//      cuando se crean fichas duplicadas.
//   2. Alta doble desde la app: el DT agrega al jugador y, en paralelo, el jugador pide
//      sumarse y alguien aprueba la solicitud. Ninguno de los dos caminos chequea si ya existe.
//
// QUÉ ROMPÍA
//
// La convocatoria de un entrenamiento insertaba una fila de asistencia por contrato, y el
// índice único {entrenamiento, jugador} la rechazaba: la creación devolvía 500.
//
// USO
//   node -r dotenv/config scripts/contratosDuplicados.js
//   node -r dotenv/config scripts/contratosDuplicados.js --equipo <id>
//   node -r dotenv/config scripts/contratosDuplicados.js --commit    # consolida los solapados

import mongoose from 'mongoose';

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? process.argv[i + 1] : null;
};
const COMMIT = process.argv.includes('--commit');

const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

/**
 * ¿Dos contratos se pisan en el tiempo?
 *
 * Es lo que separa un duplicado real de un historial legítimo. Un jugador que estuvo en 2023 y
 * volvió en 2025 tiene dos contratos que NO se solapan y hay que dejarlos en paz: borrar uno
 * perdería historia. Dos que se solapan describen el mismo período dos veces, y eso no puede
 * ser otra cosa que un error de carga.
 *
 * Un `hasta` vacío significa contrato abierto: se trata como infinito, no como "termina hoy".
 */
const seSolapan = (a, b) => {
  const desdeA = a.desde ? new Date(a.desde).getTime() : -Infinity;
  const hastaA = a.hasta ? new Date(a.hasta).getTime() : Infinity;
  const desdeB = b.desde ? new Date(b.desde).getTime() : -Infinity;
  const hastaB = b.hasta ? new Date(b.hasta).getTime() : Infinity;
  return desdeA <= hastaB && desdeB <= hastaA;
};

async function principal() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error(c.err('Falta MONGO_URI. Corré con: node -r dotenv/config scripts/contratosDuplicados.js'));
    process.exit(1);
  }

  await mongoose.connect(uri);

  const JugadorEquipo = (await import('../src/models/Jugador/JugadorEquipo.js')).default;
  const Jugador = (await import('../src/models/Jugador/Jugador.js')).default;
  const Equipo = (await import('../src/models/Equipo/Equipo.js')).default;

  const filtro = {};
  const equipoArg = arg('--equipo');
  if (equipoArg && mongoose.Types.ObjectId.isValid(equipoArg)) filtro.equipo = equipoArg;

  const contratos = await JugadorEquipo.find(filtro)
    .select('jugador equipo estado desde hasta origen creadoPor createdAt')
    .lean();

  const grupos = new Map();
  for (const ct of contratos) {
    const clave = `${ct.jugador}|${ct.equipo}`;
    const lista = grupos.get(clave) ?? [];
    lista.push(ct);
    grupos.set(clave, lista);
  }

  const duplicados = [...grupos.entries()].filter(([, lista]) => lista.length > 1);

  if (duplicados.length === 0) {
    console.log(c.ok('✓ No hay jugadores con más de un contrato en el mismo equipo.'));
    await mongoose.disconnect();
    return;
  }

  const jugadorIds = [...new Set(duplicados.map(([k]) => k.split('|')[0]))];
  const equipoIds = [...new Set(duplicados.map(([k]) => k.split('|')[1]))];
  const jugadores = new Map(
    (await Jugador.find({ _id: { $in: jugadorIds } }).select('nombre apellido alias').lean()).map((j) => [
      String(j._id),
      j.alias || [j.nombre, j.apellido].filter(Boolean).join(' ').trim() || String(j._id),
    ])
  );
  const equipos = new Map(
    (await Equipo.find({ _id: { $in: equipoIds } }).select('nombre').lean()).map((e) => [String(e._id), e.nombre])
  );

  console.log(c.bold(`\n${duplicados.length} jugador(es) con contratos repetidos:\n`));

  const aConsolidar = [];

  for (const [clave, lista] of duplicados) {
    const [jugadorId, equipoId] = clave.split('|');
    const ordenados = [...lista].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Solapado = describe el mismo período dos veces. Es el único caso inequívocamente malo.
    const haySolape = ordenados.some((a, i) => ordenados.slice(i + 1).some((b) => seSolapan(a, b)));

    console.log(
      `${haySolape ? c.err('✗') : c.warn('~')} ${c.bold(jugadores.get(jugadorId) ?? jugadorId)} ${c.dim(
        `en ${equipos.get(equipoId) ?? equipoId}`
      )} — ${ordenados.length} contratos ${haySolape ? c.err('(se solapan)') : c.dim('(períodos separados: probablemente legítimo)')}`
    );

    for (const ct of ordenados) {
      console.log(
        c.dim(
          `    ${String(ct._id)}  estado=${ct.estado}  ${fmt(ct.desde)} → ${fmt(ct.hasta)}  ` +
            `origen=${ct.origen ?? '—'}  creado=${fmt(ct.createdAt)}`
        )
      );
    }

    if (haySolape) aConsolidar.push({ jugadorId, equipoId, contratos: ordenados });
  }

  if (aConsolidar.length === 0) {
    console.log(
      c.ok('\n✓ Ninguno se solapa: son historiales legítimos (el jugador se fue y volvió). No hay nada que arreglar.')
    );
    await mongoose.disconnect();
    return;
  }

  console.log(
    c.bold(`\n${aConsolidar.length} caso(s) para consolidar.`) +
      c.dim(' Se conserva el más viejo, extendiendo su período para cubrir a los demás, y se borran los otros.\n')
  );

  if (!COMMIT) {
    console.log(c.warn('Simulación. Nada se modificó. Volvé a correr con --commit para aplicar.'));
    await mongoose.disconnect();
    return;
  }

  for (const { contratos: lista } of aConsolidar) {
    const [conservado, ...sobrantes] = lista;

    // El período resultante cubre a todos: se toma el `desde` más temprano y el `hasta` más
    // tardío. Un `hasta` vacío gana siempre, porque significa contrato abierto.
    const desdes = lista.map((x) => x.desde).filter(Boolean).map((d) => new Date(d).getTime());
    const abierto = lista.some((x) => !x.hasta);
    const hastas = lista.map((x) => x.hasta).filter(Boolean).map((d) => new Date(d).getTime());

    const cambios = {};
    if (desdes.length) cambios.desde = new Date(Math.min(...desdes));
    cambios.hasta = abierto || hastas.length === 0 ? null : new Date(Math.max(...hastas));
    // Si alguno seguía vigente, el consolidado también: una baja no puede ganarle a un alta.
    if (lista.some((x) => x.estado === 'aceptado')) cambios.estado = 'aceptado';

    await JugadorEquipo.updateOne({ _id: conservado._id }, { $set: cambios });
    await JugadorEquipo.deleteMany({ _id: { $in: sobrantes.map((x) => x._id) } });

    console.log(
      c.ok(`✓ ${String(conservado._id)} consolidado (${fmt(cambios.desde)} → ${fmt(cambios.hasta)}), ` +
        `${sobrantes.length} borrado(s)`)
    );
  }

  console.log(c.ok('\nListo.'));
  await mongoose.disconnect();
}

principal().catch(async (error) => {
  console.error(c.err('Error:'), error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
