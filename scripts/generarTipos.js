#!/usr/bin/env node
/**
 * Genera los tipos de TypeScript de los frontends a partir de los schemas de Mongoose.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * El backend es Mongoose en JavaScript puro, sin tipos, y cada uno de los 6 frontends reescribe
 * a mano las interfaces de las mismas entidades. La misma entidad termina declarada seis veces
 * y las copias divergen en silencio. El caso que ya nos costó caro: `Partido.estado`. El enum
 * real es ['programado','en_juego','finalizado','cancelado'], pero por el camino aparecieron
 * 'pendiente', 'confirmado', 'proximamente' y 'en_curso'. Y el filtro `?estado=` del backend
 * mete el valor directo en la query de Mongo, así que un estado inexistente NO da error:
 * devuelve cero resultados. Una sección de la app vacía y nadie se entera.
 *
 * Generar los tipos desde el schema hace que esa clase de bug sea imposible de escribir.
 *
 * POR QUÉ ASÍ Y NO UN PAQUETE COMPARTIDO
 *
 * Son 7 repos independientes por decisión deliberada, sin workspaces. Un paquete npm privado
 * obligaría a publicar y versionar en cada cambio de schema. Este script escribe un archivo y
 * lo copia a cada frontend: el archivo queda versionado en cada repo, se lee en el diff cuando
 * cambia, y no hay infraestructura nueva que mantener.
 *
 * QUÉ NO HACE
 *
 * No reemplaza a los tipos de vista de cada app. Emite la forma del documento tal como sale de
 * Mongo; lo que cada frontend arma para su UI (agregados, campos calculados, respuestas de
 * endpoints compuestos) sigue siendo suyo. La idea es que las apps importen de acá lo que es
 * la entidad y construyan encima, no que borren sus tipos.
 *
 * USO
 *   node scripts/generarTipos.js            # escribe y copia a los 6 frontends
 *   node scripts/generarTipos.js --check    # falla si lo generado difiere de lo commiteado
 *   node scripts/generarTipos.js --solo-backend
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import mongoose from 'mongoose';

const AQUI = path.dirname(url.fileURLToPath(import.meta.url));
const RAIZ_BACKEND = path.resolve(AQUI, '..');
const RAIZ_CONTENEDORA = path.resolve(RAIZ_BACKEND, '..');
const SALIDA_BACKEND = path.join(RAIZ_BACKEND, 'src', 'types', 'modelos.ts');

/** Dónde cae el archivo en cada frontend. La ruta es la misma en los seis. */
const FRONTENDS = [
  'Overtime-Public',
  'Overtime-Admin',
  'Overtime-Organizaciones',
  'dodgeballmanager',
  'Overtime-Manager',
  'Overtime-Partido',
];
const DESTINO_FRONTEND = path.join('src', 'shared', 'types', 'modelos.generado.ts');

// --------------------------------------------------------------------------------------------

const listarArchivos = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return listarArchivos(completo);
    return entrada.name.endsWith('.js') ? [completo] : [];
  });

/** Importar cada modelo lo registra en `mongoose.models`. No hace falta conectarse a la base. */
async function cargarModelos() {
  const archivos = listarArchivos(path.join(RAIZ_BACKEND, 'src', 'models')).sort();
  for (const archivo of archivos) {
    await import(url.pathToFileURL(archivo).href);
  }
  return archivos.length;
}

// --------------------------------------------------------------------------------------------

const enumsEmitidos = new Map();
/** Modelos realmente registrados, para no emitir referencias a tipos que no existen. */
const modelosConocidos = new Set();
/** refs que apuntan a un modelo inexistente. Se avisan: casi siempre son un bug del schema. */
const referenciasColgadas = new Set();

const aPascal = (texto) =>
  String(texto)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((parte) => parte[0].toUpperCase() + parte.slice(1))
    .join('');

/**
 * Los enums son la mitad del valor de todo esto: son exactamente donde la copia a mano se
 * desincroniza. Cada uno sale como su propio `type` exportado para poder importarlo suelto.
 */
function registrarEnum(modelo, rutaCampo, valores) {
  const nombre = `${modelo}${aPascal(rutaCampo)}`;
  const union = valores.map((v) => `'${v}'`).join(' | ');
  const previo = enumsEmitidos.get(nombre);
  // Dos schemas distintos pueden llamar igual a un campo con enums distintos. Si pasa, se
  // desambigua en vez de emitir el tipo dos veces con contenidos diferentes.
  if (previo && previo !== union) return { nombre: null, union };
  enumsEmitidos.set(nombre, union);
  return { nombre, union };
}

function tipoDeCampo(modelo, rutaCampo, tipo) {
  const opciones = tipo.options ?? {};

  switch (tipo.instance) {
    case 'String': {
      // El orden importa: `opciones.enum` normalmente ES el array, y `array.values` existe —
      // es el iterador nativo de Array.prototype. Preguntar por `.values` primero devolvía esa
      // función, que es truthy, y ningún enum llegaba a detectarse.
      const bruto = opciones.enum;
      const valores = Array.isArray(bruto)
        ? bruto
        : Array.isArray(bruto?.values)
        ? bruto.values
        : null;
      if (valores?.length) {
        const { nombre, union } = registrarEnum(modelo, rutaCampo, valores.filter((v) => v !== null));
        return nombre ?? union;
      }
      return 'string';
    }
    case 'Number':
      return 'number';
    case 'Boolean':
      return 'boolean';
    // Las fechas viajan como ISO en JSON. Tiparlas `Date` sería mentir: lo que llega al
    // frontend es un string y hay que parsearlo.
    case 'Date':
      return 'string';
    case 'ObjectId':
    case 'ObjectID':
      if (!opciones.ref) return 'string';
      if (modelosConocidos.has(opciones.ref)) return `Ref<${opciones.ref}>`;
      // El schema referencia un modelo que no existe. Emitir `Ref<Federacion>` haria que el
      // archivo generado ni compile, asi que degrada a string y se avisa por consola.
      referenciasColgadas.add(`${modelo}.${rutaCampo} -> ${opciones.ref}`);
      return 'string';
    case 'Decimal128':
      return 'string';
    case 'Map':
      return 'Record<string, unknown>';
    case 'Array': {
      if (tipo.schema) return `Array<${tipoDeSubSchema(tipo.schema)}>`;
      const caster = tipo.caster;
      if (!caster) return 'unknown[]';
      return `Array<${tipoDeCampo(modelo, rutaCampo, caster)}>`;
    }
    case 'Embedded':
      return tipoDeSubSchema(tipo.schema);
    default:
      return 'unknown';
  }
}

function tipoDeSubSchema(schema) {
  const cuerpo = camposDeSchema('', schema, '    ');
  return `{\n${cuerpo}\n    }`;
}

/**
 * Mongoose aplana los objetos anidados en rutas con puntos (`redesSociales.instagram`), así que
 * hay que reconstruir el árbol para no emitir un campo llamado literalmente "redesSociales.instagram".
 */
function construirArbol(schema) {
  const arbol = {};
  for (const [ruta, tipo] of Object.entries(schema.paths)) {
    if (ruta === '__v') continue;
    const partes = ruta.split('.');
    let nodo = arbol;
    for (let i = 0; i < partes.length - 1; i += 1) {
      nodo[partes[i]] ??= { __hijos: {} };
      nodo = nodo[partes[i]].__hijos;
    }
    nodo[partes[partes.length - 1]] = { __tipo: tipo, __ruta: ruta };
  }
  return arbol;
}

function camposDeSchema(modelo, schema, sangria = '  ') {
  const arbol = construirArbol(schema);

  const emitirNodo = (nombre, nodo, sang) => {
    if (nodo.__tipo) {
      const tipo = nodo.__tipo;
      const opciones = tipo.options ?? {};
      // Opcional salvo que sea obligatorio o tenga default: con un default el campo siempre
      // viene en la respuesta, y marcarlo opcional obligaría a chequeos que nunca aplican.
      const seguro = opciones.required === true || opciones.default !== undefined || nombre === '_id';
      let ts = tipoDeCampo(modelo, nombre, tipo);
      // `default: null` es distinto de "sin default": el campo SIEMPRE viene, pero puede venir
      // en null. Sin este `| null` el tipo miente en la dirección peor — le promete al
      // consumidor un valor que no está, y el `.nombre` explota en runtime.
      if (opciones.default === null) ts = `${ts} | null`;
      return `${sang}${nombre}${seguro ? '' : '?'}: ${ts};`;
    }
    const hijos = Object.entries(nodo.__hijos)
      .map(([n, h]) => emitirNodo(n, h, sang + '  '))
      .join('\n');
    return `${sang}${nombre}?: {\n${hijos}\n${sang}};`;
  };

  return Object.entries(arbol)
    .map(([nombre, nodo]) => emitirNodo(nombre, nodo, sangria))
    .join('\n');
}

// --------------------------------------------------------------------------------------------

const CABECERA = `/* eslint-disable */
/**
 * ARCHIVO GENERADO — NO EDITAR A MANO.
 *
 * Lo produce \`scripts/generarTipos.js\` en el repo del backend a partir de los schemas de
 * Mongoose, y se copia a los 6 frontends. Cualquier cambio hecho acá se pierde en la próxima
 * corrida; si un tipo está mal, el que está mal es el schema.
 *
 * Para regenerarlo, desde el repo \`overtime\`:
 *     node scripts/generarTipos.js
 *
 * Las fechas son \`string\`: viajan como ISO en JSON. Los campos son opcionales salvo que el
 * schema los marque \`required\` o les dé un \`default\`, porque en esos casos siempre vienen.
 */

/**
 * Una referencia a otro documento. Según el endpoint viene como el id suelto o como el
 * documento entero populado, así que el consumidor tiene que angostarla antes de usarla:
 *
 *     const id = typeof partido.equipoLocal === 'string' ? partido.equipoLocal : partido.equipoLocal?._id;
 */
export type Ref<T> = string | T;
`;

function generar() {
  const modelos = Object.entries(mongoose.models).sort(([a], [b]) => a.localeCompare(b));
  for (const [nombre] of modelos) modelosConocidos.add(nombre);
  const interfaces = [];

  for (const [nombre, modelo] of modelos) {
    const rutas = modelo.schema.paths;
    const campos = camposDeSchema(nombre, modelo.schema);

    // `_id` y las marcas de tiempo se agregan sólo si el schema NO las declara ya. Varios
    // modelos definen `_id` a mano (por ejemplo los que usan un id de otra fuente como clave)
    // o su propio `createdAt`, y emitirlos igual producía identificadores duplicados.
    const cabeza = rutas._id ? '' : '  _id: string;\n';
    const marcaTiempo = [
      modelo.schema.options?.timestamps && !rutas.createdAt ? '\n  createdAt: string;' : '',
      modelo.schema.options?.timestamps && !rutas.updatedAt ? '\n  updatedAt: string;' : '',
    ].join('');

    interfaces.push(`export interface ${nombre} {\n${cabeza}${campos}${marcaTiempo}\n}`);
  }

  const bloqueEnums = [...enumsEmitidos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nombre, union]) => `export type ${nombre} = ${union};`)
    .join('\n');

  return [
    CABECERA,
    '/* ---------- Uniones de los enums de los schemas ---------- */\n',
    bloqueEnums,
    '\n/* ---------- Documentos ---------- */\n',
    interfaces.join('\n\n'),
    '',
  ].join('\n');
}

// --------------------------------------------------------------------------------------------

async function principal() {
  const argumentos = process.argv.slice(2);
  const soloChequear = argumentos.includes('--check');
  const soloBackend = argumentos.includes('--solo-backend');

  const cantidad = await cargarModelos();
  // Las interfaces se arman antes que el bloque de enums porque emitirlas es lo que llena
  // `enumsEmitidos`. `generar()` ya respeta ese orden internamente.
  const contenido = generar();

  const destinos = [SALIDA_BACKEND];
  if (!soloBackend) {
    for (const app of FRONTENDS) {
      const raiz = path.join(RAIZ_CONTENEDORA, app);
      if (!fs.existsSync(raiz)) {
        console.warn(`  ! ${app} no está en ${RAIZ_CONTENEDORA} — salteado`);
        continue;
      }
      destinos.push(path.join(raiz, DESTINO_FRONTEND));
    }
  }

  let desactualizados = 0;
  for (const destino of destinos) {
    const previo = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : null;
    const igual = previo === contenido;

    if (soloChequear) {
      if (!igual) {
        desactualizados += 1;
        console.error(`  ✗ desactualizado: ${path.relative(RAIZ_CONTENEDORA, destino)}`);
      }
      continue;
    }

    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, contenido);
    console.log(`  ${igual ? '=' : '→'} ${path.relative(RAIZ_CONTENEDORA, destino)}`);
  }

  if (soloChequear && desactualizados > 0) {
    console.error(
      `\n${desactualizados} archivo(s) de tipos desactualizados. Corré: node scripts/generarTipos.js`
    );
    process.exit(1);
  }

  console.log(
    `\n${cantidad} modelos leídos · ${Object.keys(mongoose.models).length} interfaces · ${enumsEmitidos.size} enums`
  );

  // No es un error del generador sino del schema: un `ref` a un modelo que no existe significa
  // que ese populate nunca va a funcionar. Se avisa cada corrida para que no se normalice.
  if (referenciasColgadas.size > 0) {
    console.warn(`\n⚠ ${referenciasColgadas.size} referencia(s) a modelos inexistentes:`);
    for (const ref of [...referenciasColgadas].sort()) console.warn(`    ${ref}`);
    console.warn('  Se emiten como `string`. Revisá el ref en el schema.');
  }
}

principal().catch((error) => {
  console.error('Error generando los tipos:', error);
  process.exit(1);
});
