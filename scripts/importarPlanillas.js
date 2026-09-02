// scripts/importarPlanillas.js
//
// Carga planillas históricas de un equipo (estadísticas por jugador y set) desde un CSV
// hacia las colecciones Planilla*. NO toca el registro oficial de ninguna competencia:
// deja todo en estado 'borrador', igual que si el equipo lo hubiera cargado a mano
// desde la app. Oficializar sigue siendo una decisión posterior y por partido.
//
// Uso:
//   node -r dotenv/config scripts/importarPlanillas.js --equipo <id> --file <archivo|carpeta>
//
// Acepta .csv (formato largo: una fila por jugador y set) y .xlsx (las planillas de
// Excel del club, en formato matriz). Si --file es una carpeta, la recorre entera.
//
// Flags:
//   --dry-run   (por defecto)  No escribe nada. Reporta qué haría y qué no puede resolver.
//   --commit                   Escribe de verdad. Sin este flag el script nunca toca la base.
//   --modo sets|directa        Por defecto 'sets' si hay número de set, si no 'directa'.
//   --usuario <uid>            Queda como creadoPor. Por defecto 'import-script'.
//   --alias <archivo.json>     Mapea apodos de la planilla a nombres reales del plantel.
//   --partidos <archivo.json>  Fuerza el partido de un archivo, por si la planilla tiene
//                              la fecha mal escrita o vacía.
//   --listar-nombres           Solo lista los nombres que aparecen en los archivos y sale.
//                              Sirve para armar el archivo de alias sin conectarse a nada.
//   --sobrescribir             Permite pisar estadísticas ya cargadas en una planilla que
//                              ya existía. Sin este flag, esos partidos se saltan.
//
// El dry-run no es una cortesía: importar planillas mal matcheadas le carga a un jugador
// las estadísticas de otro, y eso después no se distingue de un dato real.
//
// Por el mismo motivo el script se niega a pisar una planilla que ya tiene datos: puede
// haberla empezado alguien a mano desde la app, y sus valores no se recuperan. Mongo no
// guarda historial.

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

import { parsearCSVConCabecera } from './lib/csv.js';
import {
  resolverColumnas,
  normalizarFilas,
  normalizarNombre,
  matchearNombre,
} from './lib/normalizarPlanilla.js';
import { leerHoja } from './lib/xlsx.js';
import { parsearPlanilla } from './lib/parsearPlanillaMoran.js';

import Equipo from '../src/models/Equipo/Equipo.js';
import Partido from '../src/models/Partido/Partido.js';
import PlanillaEquipo from '../src/models/Equipo/PlanillaEquipo.js';
import PlanillaPresente from '../src/models/Equipo/PlanillaPresente.js';
import PlanillaSet from '../src/models/Equipo/PlanillaSet.js';
import PlanillaEstadistica from '../src/models/Equipo/PlanillaEstadistica.js';
import { obtenerJugadoresElegibles } from '../src/services/jugadoresElegiblesService.js';

// ---------------------------------------------------------------- argumentos

function parsearArgs(argv) {
  const args = { dryRun: true, usuario: 'import-script' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--commit') args.dryRun = false;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--equipo') args.equipo = argv[++i];
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--modo') args.modo = argv[++i];
    else if (a === '--usuario') args.usuario = argv[++i];
    // --alias se puede repetir: los archivos se aplican en orden y el último gana.
    // Sirve para tener una tabla común del club y otra por categoría, porque un mismo
    // apodo puede ser dos personas distintas — "Agus" es Agustín en masculino y
    // Agustina en femenino.
    else if (a === '--alias') (args.alias ??= []).push(argv[++i]);
    else if (a === '--partidos') args.partidos = argv[++i];
    else if (a === '--listar-nombres') args.listarNombres = true;
    else if (a === '--sobrescribir') args.sobrescribir = true;
  }
  return args;
}

/** Todos los .csv y .xlsx bajo una ruta, sea archivo suelto o carpeta. */
function juntarArchivos(ruta) {
  const stat = fs.statSync(ruta);
  if (!stat.isDirectory()) return [ruta];

  const encontrados = [];
  const recorrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completa);
      // Excel deja archivos de bloqueo '~$…' al abrir un libro; no son planillas.
      else if (/\.(csv|xlsx)$/i.test(entrada.name) && !entrada.name.startsWith('~$')) {
        encontrados.push(completa);
      }
    }
  };
  recorrer(ruta);
  return encontrados.sort();
}

/**
 * Lee un archivo (csv o xlsx) y devuelve filas canónicas.
 * Las dos vías producen la misma forma, así que el resto del script no distingue.
 */
function leerArchivo(ruta) {
  const nombre = path.basename(ruta);

  if (/\.xlsx$/i.test(ruta)) {
    const { meta, filas, avisos } = parsearPlanilla(leerHoja(ruta), nombre);
    return { nombre, filas, avisos, meta, errores: [] };
  }

  const { cabecera, filas: crudas } = parsearCSVConCabecera(fs.readFileSync(ruta, 'utf8'));
  const { mapa, faltantes } = resolverColumnas(cabecera);
  if (faltantes.length) {
    return {
      nombre,
      filas: [],
      avisos: [`Faltan columnas obligatorias: ${faltantes.join(', ')}`],
      meta: {},
      errores: [],
    };
  }
  const { filas, errores } = normalizarFilas(crudas, mapa);
  return { nombre, filas, avisos: [], meta: {}, errores };
}

/**
 * Alias de nombres: { "GABI": "Gabriel Pérez", "MATI Z": "Matías Zayas" }.
 *
 * Las planillas del club usan apodos y varían entre archivos —el mismo jugador aparece
 * como GABI, gabi y Gabriel— así que sin esta tabla el matcheo contra el plantel falla
 * o, peor, acierta por casualidad con la persona equivocada.
 */
function cargarAlias(rutas) {
  const mapa = new Map();
  for (const ruta of [].concat(rutas ?? [])) {
    const crudo = JSON.parse(fs.readFileSync(path.resolve(ruta), 'utf8'));
    for (const [k, v] of Object.entries(crudo)) {
      // Las claves con guión bajo adelante son notas para quien edita el archivo:
      // JSON no tiene comentarios y esta es la convención menos molesta.
      if (k.startsWith('_')) continue;
      mapa.set(normalizarNombre(k), v);
    }
  }
  return mapa;
}

// ---------------------------------------------------------------- utilidades

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/** Mismo día calendario, ignorando la hora. */
function mismoDia(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

const nombreEquipo = (e) => (typeof e === 'object' && e ? e.nombre : null);

/**
 * Busca el partido de este equipo en esa fecha contra ese rival.
 *
 * Se exige coincidencia de fecha Y de rival: solo por fecha, un equipo que jugó dos
 * partidos el mismo día (habitual en una fecha de liga) matchearía el equivocado.
 */
async function buscarPartido({ equipoId, fecha, rival, pelota, partidosDelEquipo }) {
  const delDia = partidosDelEquipo.filter((p) => p.fecha && mismoDia(new Date(p.fecha), fecha));
  if (!delDia.length) return { partido: null, motivo: 'sin-partido-esa-fecha' };

  const buscado = normalizarNombre(rival);
  let coincidencias = delDia.filter((p) => {
    const local = normalizarNombre(nombreEquipo(p.equipoLocal));
    const visitante = normalizarNombre(nombreEquipo(p.equipoVisitante));
    const esLocal = String(p.equipoLocal?._id) === String(equipoId);
    const nombreRival = esLocal ? visitante : local;
    return nombreRival === buscado;
  });

  // Contra el mismo rival el mismo día suele haber dos partidos, uno de cada pelota.
  // La planilla trae la suya en la celda "PELOTA:", así que desempata sin adivinar.
  if (coincidencias.length > 1 && pelota) {
    const buscadaPelota = normalizarNombre(pelota);
    const porPelota = coincidencias.filter(
      (p) => normalizarNombre(p.competencia?.modalidad) === buscadaPelota,
    );
    if (porPelota.length) coincidencias = porPelota;
  }

  if (coincidencias.length === 1) return { partido: coincidencias[0], motivo: null };
  if (coincidencias.length > 1) return { partido: null, motivo: 'rival-ambiguo' };

  // Hubo partidos ese día pero contra otro rival: casi siempre es el nombre mal escrito.
  const rivalesDelDia = delDia.map((p) => {
    const esLocal = String(p.equipoLocal?._id) === String(equipoId);
    return nombreEquipo(esLocal ? p.equipoVisitante : p.equipoLocal) || '?';
  });
  return { partido: null, motivo: 'rival-no-coincide', rivalesDelDia };
}

// ---------------------------------------------------------------- principal

async function main() {
  const args = parsearArgs(process.argv);

  // --listar-nombres solo lee archivos: no necesita equipo ni base de datos.
  if (!args.file || (!args.equipo && !args.listarNombres)) {
    console.error(c.err('Faltan argumentos.'));
    console.error('Uso: node -r dotenv/config scripts/importarPlanillas.js --equipo <id> --file <archivo|carpeta> [--commit]');
    console.error('     node scripts/importarPlanillas.js --file <carpeta> --listar-nombres');
    process.exit(1);
  }
  if (!args.listarNombres && !mongoose.Types.ObjectId.isValid(args.equipo)) {
    console.error(c.err(`equipo inválido: ${args.equipo}`));
    process.exit(1);
  }

  const ruta = path.resolve(args.file);
  if (!fs.existsSync(ruta)) {
    console.error(c.err(`No existe el archivo: ${ruta}`));
    process.exit(1);
  }

  // --- 1. Leer todos los archivos --------------------------------------------
  const rutas = juntarArchivos(ruta);
  if (!rutas.length) {
    console.error(c.err(`No hay archivos .csv ni .xlsx en ${ruta}`));
    process.exit(1);
  }

  const alias = cargarAlias(args.alias);

  // Override de partido por archivo. Hace falta cuando la planilla tiene la fecha mal
  // escrita o vacía: ahí el matcheo por fecha + rival no puede funcionar, y la
  // alternativa sería editar el Excel. Se resuelve fuera del archivo original para no
  // tocar la fuente.
  const overridePartido = args.partidos
    ? new Map(
      Object.entries(JSON.parse(fs.readFileSync(path.resolve(args.partidos), 'utf8')))
        .filter(([k]) => !k.startsWith('_')),
    )
    : new Map();

  const filas = [];
  const problemasArchivo = [];

  console.log(c.bold('\n=== Lectura de archivos ==='));

  for (const r of rutas) {
    let leido;
    try {
      leido = leerArchivo(r);
    } catch (e) {
      problemasArchivo.push(`${c.err('✗')} ${path.basename(r)} — ${e.message}`);
      continue;
    }

    const { nombre, filas: propias, avisos, meta, errores } = leido;
    const detalle = meta?.rival
      ? `${meta.rival} · ${meta.fecha ? meta.fecha.toISOString().slice(0, 10) : c.warn('sin fecha')}`
      : '';

    if (!propias.length) {
      problemasArchivo.push(`${c.warn('–')} ${nombre} — sin filas utilizables`);
    } else {
      console.log(`${c.ok('✓')} ${nombre} ${c.dim(`— ${propias.length} filas · ${detalle}`)}`);
    }

    avisos.forEach((a) => console.log(`    ${c.warn('aviso')} ${a}`));
    (errores || []).slice(0, 5).forEach((e) => console.log(`    ${c.warn('línea ' + e.linea)} ${e.error}`));

    // Los apodos se resuelven acá, una sola vez, para que el resto del script trabaje
    // siempre con el nombre canónico.
    const partidoForzado = overridePartido.get(nombre) ?? null;
    if (partidoForzado) {
      console.log(`    ${c.dim(`partido forzado a ${partidoForzado}`)}`);
    }

    for (const f of propias) {
      const canonico = alias.get(normalizarNombre(f.jugador));
      const fila = canonico ? { ...f, jugador: canonico, apodo: f.jugador } : { ...f };
      fila.archivo = nombre;
      if (partidoForzado) fila.partidoForzado = partidoForzado;
      filas.push(fila);
    }
  }

  if (problemasArchivo.length) {
    console.log('');
    problemasArchivo.forEach((p) => console.log(p));
  }

  const modo = args.modo || (filas.some((f) => f.numeroSet) ? 'sets' : 'directa');

  // --- Listado de nombres (sin base de datos) --------------------------------
  if (args.listarNombres) {
    // Se agrupa por el nombre ya resuelto, mostrando debajo los apodos que caen en él.
    // Así se ve de una si el archivo de alias está completo o quedaron variantes sueltas.
    const grupos = new Map();
    for (const f of filas) {
      if (!grupos.has(f.jugador)) grupos.set(f.jugador, { total: 0, variantes: new Map() });
      const g = grupos.get(f.jugador);
      g.total += 1;
      const variante = f.apodo ?? f.jugador;
      g.variantes.set(variante, (g.variantes.get(variante) ?? 0) + 1);
    }

    const sinAlias = [...grupos.entries()].filter(([, g]) => ![...g.variantes.keys()].some((v) => alias.has(normalizarNombre(v))));

    console.log(c.bold(`\n=== Jugadores (${grupos.size}) ===`));
    [...grupos.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([nombre, g]) => {
        const variantes = [...g.variantes.keys()];
        const detalle = variantes.length > 1 || variantes[0] !== nombre
          ? c.dim(`  ← ${variantes.join(', ')}`)
          : '';
        console.log(`  ${String(g.total).padStart(4)}  ${nombre}${detalle}`);
      });

    if (alias.size && sinAlias.length) {
      console.log(c.warn(`\n${sinAlias.length} sin entrada en el archivo de alias:`));
      sinAlias.forEach(([n]) => console.log(`  ${n}`));
    }
    if (!alias.size) {
      console.log(c.dim('\nArmá un JSON { "APODO": "Nombre real del plantel" } y pasalo con --alias.'));
    }
    return;
  }

  if (!filas.length) {
    console.error(c.err('\nNo quedó ninguna fila utilizable.'));
    process.exit(1);
  }

  // Sin fecha no hay forma de encontrar el partido, salvo que venga forzado por
  // --partidos, que es justamente el caso de las planillas con la fecha vacía.
  const sinFecha = filas.filter((f) => !f.fecha && !f.partidoForzado);
  const filasConFecha = filas.filter((f) => f.fecha || f.partidoForzado);
  if (sinFecha.length) {
    const archivos = [...new Set(sinFecha.map((f) => String(f.origen ?? '').split(' fila ')[0]))];
    console.log(c.warn(`\n${sinFecha.length} filas sin fecha, no se pueden ubicar en ningún partido:`));
    archivos.forEach((a) => console.log(`  ${a}`));
    console.log(c.dim('  Completá la celda FECHA: en el Excel y volvé a correr.'));
  }

  filas.length = 0;
  filas.push(...filasConFecha);

  console.log(c.bold('\n=== Resumen de lectura ==='));
  console.log(`Archivos: ${rutas.length}`);
  console.log(`Modo:     ${modo}`);
  console.log(`Filas:    ${filas.length}`);

  // --- 2. Conectar -----------------------------------------------------------
  if (!process.env.MONGO_URI) {
    console.error(c.err('Falta MONGO_URI. Corré con: node -r dotenv/config scripts/importarPlanillas.js …'));
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const equipo = await Equipo.findById(args.equipo).select('nombre').lean();
    if (!equipo) {
      console.error(c.err(`No existe el equipo ${args.equipo}`));
      process.exit(1);
    }
    console.log(`Equipo:   ${c.bold(equipo.nombre)}`);
    console.log(args.dryRun ? c.warn('\nMODO DRY-RUN — no se escribe nada\n') : c.err('\nMODO COMMIT — se va a escribir en la base\n'));

    // Todos los partidos del equipo, una sola consulta.
    const partidosDelEquipo = await Partido.find({
      $or: [{ equipoLocal: args.equipo }, { equipoVisitante: args.equipo }],
    })
      .populate('equipoLocal', 'nombre')
      .populate('equipoVisitante', 'nombre')
      .populate('competencia', 'modalidad categoria')
      .select('fecha equipoLocal equipoVisitante competencia estado')
      .lean();

    // --- 3. Agrupar por partido ---------------------------------------------
    const grupos = new Map();
    for (const fila of filas) {
      const clave = fila.partidoForzado
        ?? `${fila.fecha.toISOString().slice(0, 10)}|${normalizarNombre(fila.rival)}|${normalizarNombre(fila.pelota)}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          fecha: fila.fecha,
          rival: fila.rival,
          pelota: fila.pelota ?? null,
          partidoForzado: fila.partidoForzado ?? null,
          filas: [],
          archivos: new Set(),
        });
      }
      grupos.get(clave).filas.push(fila);
      grupos.get(clave).archivos.add(fila.archivo);
    }

    const resumen = {
      partidosResueltos: 0,
      partidosNoResueltos: 0,
      planillasCreadas: 0,
      planillasExistentes: 0,
      estadisticas: 0,
      sobrescritas: 0,
      jugadoresNoResueltos: new Map(),
    };
    const problemas = [];

    for (const grupo of grupos.values()) {
      const fechaTxt = grupo.fecha ? grupo.fecha.toISOString().slice(0, 10) : 'sin fecha';
      const etiqueta = `${fechaTxt} vs ${grupo.rival ?? '?'}`;

      // Dos archivos que caen en el mismo partido se pisan entre sí: el índice es
      // {planillaSet, planillaPresente}, así que el segundo sobreescribe al primero y
      // el total queda menor que la suma de las filas leídas, sin ningún aviso. Suele
      // ser una copia vieja del mismo Excel conviviendo con la buena.
      if (grupo.archivos.size > 1) {
        problemas.push(
          `${c.err('✗')} ${etiqueta} — ${grupo.archivos.size} archivos apuntan al mismo partido y se pisarían entre sí:\n      ${[...grupo.archivos].join('\n      ')}\n      Dejá uno solo y volvé a correr.`,
        );
        resumen.partidosNoResueltos += 1;
        continue;
      }

      let partido = null;
      let motivo = null;
      let rivalesDelDia = null;

      if (grupo.partidoForzado) {
        partido = partidosDelEquipo.find((p) => String(p._id) === String(grupo.partidoForzado)) ?? null;
        if (!partido) motivo = `el partido forzado ${grupo.partidoForzado} no es de este equipo`;
      } else {
        ({ partido, motivo, rivalesDelDia } = await buscarPartido({
          equipoId: args.equipo,
          fecha: grupo.fecha,
          rival: grupo.rival,
          pelota: grupo.pelota,
          partidosDelEquipo,
        }));
      }

      if (!partido) {
        resumen.partidosNoResueltos += 1;
        const detalle = motivo === 'rival-no-coincide'
          ? `ese día jugaste contra: ${rivalesDelDia.join(', ')}`
          : motivo;
        problemas.push(`${c.warn('✗')} ${etiqueta} — ${detalle} (${grupo.filas.length} filas)`);
        continue;
      }

      resumen.partidosResueltos += 1;

      // Los jugadores se matchean contra la cascada de elegibles del partido, no contra
      // el plantel actual: así un nombre de 2024 se resuelve con el plantel de 2024.
      const elegibles = await obtenerJugadoresElegibles({
        partidoId: String(partido._id),
        equipoId: String(args.equipo),
      });
      const candidatos = elegibles?.jugadores ?? [];

      const esLocal = String(partido.equipoLocal?._id) === String(args.equipo);

      // Resolver jugadores de este partido
      const filasResueltas = [];
      for (const fila of grupo.filas) {
        const { match, motivo: motivoNombre, opciones } = matchearNombre(fila.jugador, candidatos);
        if (!match) {
          const clave = fila.jugador;
          if (!resumen.jugadoresNoResueltos.has(clave)) {
            resumen.jugadoresNoResueltos.set(clave, { motivo: motivoNombre, opciones, veces: 0 });
          }
          resumen.jugadoresNoResueltos.get(clave).veces += 1;
          continue;
        }
        filasResueltas.push({ ...fila, jugadorId: match.jugadorId, jugadorPartidoId: match.jugadorPartidoId });
      }

      if (!filasResueltas.length) {
        problemas.push(`${c.warn('✗')} ${etiqueta} — ningún jugador del CSV coincide con el plantel`);
        continue;
      }

      // Red de seguridad: dos nombres distintos de la planilla no pueden terminar en el
      // mismo jugador. Si pasa, uno de los dos está mal resuelto y sus estadísticas se
      // pisarían entre sí (el índice es {planillaSet, planillaPresente}), quedando como
      // datos válidos de una persona que no jugó eso. Se corta el partido entero.
      const nombresPorJugador = new Map();
      for (const f of filasResueltas) {
        const nombreEnPlanilla = f.apodo ?? f.jugador;
        if (!nombresPorJugador.has(f.jugadorId)) nombresPorJugador.set(f.jugadorId, new Set());
        nombresPorJugador.get(f.jugadorId).add(nombreEnPlanilla);
      }
      const choques = [...nombresPorJugador.values()].filter((s) => s.size > 1);
      if (choques.length) {
        choques.forEach((s) => {
          problemas.push(`${c.err('✗')} ${etiqueta} — "${[...s].join('" y "')}" se resolvieron al MISMO jugador. Agregá una entrada de alias para cada uno.`);
        });
        resumen.partidosResueltos -= 1;
        resumen.partidosNoResueltos += 1;
        continue;
      }

      console.log(`${c.ok('✓')} ${etiqueta} ${c.dim(`— ${filasResueltas.length} filas, ${new Set(filasResueltas.map((f) => f.jugadorId)).size} jugadores`)}`);

      // --- 4. Chequear qué hay ya en esa planilla ---------------------------
      //
      // Esto se mira ANTES de escribir y también en dry-run. La primera versión del
      // script no lo hacía: un equipo que ya había empezado a cargar la planilla desde
      // la app se encontró con sus valores sobrescritos, y el dry-run no lo había
      // anticipado. El ensayo tiene que mostrar exactamente lo que va a pasar.
      let planilla = await PlanillaEquipo.findOne({ partido: partido._id, equipo: args.equipo });
      let estadisticasPrevias = 0;

      if (planilla) {
        estadisticasPrevias = await PlanillaEstadistica.countDocuments({ planilla: planilla._id });

        if (!['borrador', 'rechazada'].includes(planilla.estado)) {
          problemas.push(`${c.err('✗')} ${etiqueta} — la planilla está en "${planilla.estado}" y no admite cambios`);
          resumen.partidosResueltos -= 1;
          resumen.partidosNoResueltos += 1;
          continue;
        }

        if (estadisticasPrevias > 0) {
          const aviso = `ya tiene ${estadisticasPrevias} estadística${estadisticasPrevias === 1 ? '' : 's'} cargada${estadisticasPrevias === 1 ? '' : 's'}`;
          if (!args.sobrescribir) {
            problemas.push(`${c.warn('✗')} ${etiqueta} — ${aviso}. Se salta para no pisarlas (usá --sobrescribir si querés reemplazarlas)`);
            resumen.partidosResueltos -= 1;
            resumen.partidosNoResueltos += 1;
            continue;
          }
          console.log(`    ${c.err('SOBRESCRIBE')} ${aviso}`);
          resumen.sobrescritas += estadisticasPrevias;
        }
      }

      if (args.dryRun) {
        resumen.estadisticas += filasResueltas.length;
        if (planilla) resumen.planillasExistentes += 1;
        else resumen.planillasCreadas += 1;
        continue;
      }

      // --- 5. Escribir ------------------------------------------------------
      if (planilla) {
        resumen.planillasExistentes += 1;
      } else {
        planilla = await PlanillaEquipo.create({
          partido: partido._id,
          equipo: args.equipo,
          modo,
          creadoPor: args.usuario,
          notas: `Importada desde ${path.basename(ruta)}`,
        });
        resumen.planillasCreadas += 1;
      }

      // Presentes (upsert por jugador)
      const presentePorJugador = new Map();
      for (const jugadorId of new Set(filasResueltas.map((f) => f.jugadorId))) {
        const fuente = filasResueltas.find((f) => f.jugadorId === jugadorId);
        const presente = await PlanillaPresente.findOneAndUpdate(
          { planilla: planilla._id, jugador: jugadorId },
          {
            planilla: planilla._id,
            jugador: jugadorId,
            jugadorPartido: fuente.jugadorPartidoId || null,
            rol: 'jugador',
            creadoPor: args.usuario,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        presentePorJugador.set(jugadorId, presente._id);
      }

      // Sets (upsert por número) y estadísticas
      const setPorNumero = new Map();
      if (modo === 'sets') {
        for (const numeroSet of [...new Set(filasResueltas.map((f) => f.numeroSet))].sort((a, b) => a - b)) {
          const filaConGanador = filasResueltas.find((f) => f.numeroSet === numeroSet && f.ganadorSet);
          // 'propio'/'rival' vienen de planillas escritas desde la óptica del club:
          // se traducen a local/visitante según de qué lado jugó el equipo.
          let ganadorSet = 'pendiente';
          const crudo = filaConGanador?.ganadorSet;
          if (crudo === 'propio') ganadorSet = esLocal ? 'local' : 'visitante';
          else if (crudo === 'rival') ganadorSet = esLocal ? 'visitante' : 'local';
          else if (crudo) ganadorSet = crudo;

          const set = await PlanillaSet.findOneAndUpdate(
            { planilla: planilla._id, numeroSet },
            { planilla: planilla._id, numeroSet, ganadorSet, creadoPor: args.usuario },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
          setPorNumero.set(numeroSet, set._id);
        }
      }

      for (const fila of filasResueltas) {
        const planillaSet = modo === 'sets' ? setPorNumero.get(fila.numeroSet) ?? null : null;
        await PlanillaEstadistica.findOneAndUpdate(
          { planillaSet, planillaPresente: presentePorJugador.get(fila.jugadorId) },
          {
            planilla: planilla._id,
            planillaSet,
            planillaPresente: presentePorJugador.get(fila.jugadorId),
            throws: fila.throws,
            hits: fila.hits,
            outs: fila.outs,
            catches: fila.catches,
            survive: fila.survive,
            creadoPor: args.usuario,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        resumen.estadisticas += 1;
      }
    }

    // --- 5. Reporte ---------------------------------------------------------
    if (problemas.length) {
      console.log(c.warn('\nPartidos que no se pudieron resolver:'));
      problemas.forEach((p) => console.log(`  ${p}`));
    }

    if (resumen.jugadoresNoResueltos.size) {
      console.log(c.warn('\nNombres que no matchean con ningún jugador:'));
      for (const [nombre, info] of resumen.jugadoresNoResueltos) {
        const extra = info.motivo === 'ambiguo'
          ? ` (ambiguo: ${info.opciones?.join(' / ')})`
          : '';
        console.log(`  "${nombre}" — ${info.veces} fila${info.veces === 1 ? '' : 's'}${extra}`);
      }
      console.log(c.dim('  Corregilos en el CSV, o dalos de alta en el plantel con la fecha correcta.'));
    }

    console.log(c.bold('\n=== Resumen ==='));
    console.log(`Partidos resueltos:     ${resumen.partidosResueltos}`);
    console.log(`Partidos sin resolver:  ${resumen.partidosNoResueltos}`);
    console.log(`Planillas ${args.dryRun ? 'a crear' : 'creadas'}:       ${resumen.planillasCreadas}`);
    console.log(`Planillas ya existentes: ${resumen.planillasExistentes}`);
    console.log(`Estadísticas ${args.dryRun ? 'a escribir' : 'escritas'}:  ${resumen.estadisticas}`);
    if (resumen.sobrescritas) {
      console.log(c.err(`Estadísticas ${args.dryRun ? 'que se pisarían' : 'PISADAS'}: ${resumen.sobrescritas}`));
    }

    if (args.dryRun) {
      console.log(c.warn('\nNo se escribió nada. Repetí con --commit cuando el reporte se vea bien.'));
    } else {
      console.log(c.ok('\nListo. Las planillas quedaron en estado borrador: no tocan datos oficiales.'));
      console.log(c.dim('Para que cuenten como oficiales, cada una se oficializa desde la app.'));
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(c.err(`\nError: ${e.message}`));
  console.error(e);
  process.exit(1);
});
