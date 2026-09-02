// scripts/lib/xlsx.js
//
// Lector mínimo de .xlsx, sin dependencias.
//
// Un .xlsx es un ZIP con XML adentro. Node trae `zlib` (que descomprime deflate crudo,
// que es lo único que usa Excel) así que alcanza con leer el directorio central del ZIP
// a mano. Se evita meter SheetJS en el package.json del backend por un script de
// importación que se corre un puñado de veces.
//
// Alcance deliberado: lee valores de celda (números, shared strings, inline strings y
// fechas). No lee fórmulas —devuelve el último valor calculado, que es lo que queremos—
// ni estilos ni formato condicional.

import zlib from 'zlib';
import fs from 'fs';

// ---------------------------------------------------------------- ZIP

const FIRMA_EOCD = 0x06054b50;
const FIRMA_ENTRADA_CENTRAL = 0x02014b50;

/**
 * Descomprime un ZIP en memoria.
 * @returns {Map<string, Buffer>} nombre de archivo → contenido
 */
export function leerZip(buffer) {
  // El End Of Central Directory está al final, después de un comentario de largo
  // variable, así que se busca de atrás hacia adelante.
  let posEOCD = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 65535; i -= 1) {
    if (buffer.readUInt32LE(i) === FIRMA_EOCD) { posEOCD = i; break; }
  }
  if (posEOCD < 0) throw new Error('No parece un archivo .xlsx válido (falta el fin del ZIP)');

  const cantidad = buffer.readUInt16LE(posEOCD + 10);
  let pos = buffer.readUInt32LE(posEOCD + 16);

  const archivos = new Map();

  for (let i = 0; i < cantidad; i += 1) {
    if (buffer.readUInt32LE(pos) !== FIRMA_ENTRADA_CENTRAL) break;

    const metodo = buffer.readUInt16LE(pos + 10);
    const tamComprimido = buffer.readUInt32LE(pos + 20);
    const largoNombre = buffer.readUInt16LE(pos + 28);
    const largoExtra = buffer.readUInt16LE(pos + 30);
    const largoComentario = buffer.readUInt16LE(pos + 32);
    const offsetLocal = buffer.readUInt32LE(pos + 42);
    const nombre = buffer.toString('utf8', pos + 46, pos + 46 + largoNombre);

    // El header local repite el nombre y el extra, y sus largos pueden diferir de los
    // del directorio central: hay que leerlos de ahí para ubicar el inicio de los datos.
    const largoNombreLocal = buffer.readUInt16LE(offsetLocal + 26);
    const largoExtraLocal = buffer.readUInt16LE(offsetLocal + 28);
    const inicioDatos = offsetLocal + 30 + largoNombreLocal + largoExtraLocal;
    const datos = buffer.subarray(inicioDatos, inicioDatos + tamComprimido);

    if (metodo === 0) archivos.set(nombre, Buffer.from(datos));
    else if (metodo === 8) archivos.set(nombre, zlib.inflateRawSync(datos));
    // Otros métodos (bzip2, lzma) no los produce Excel: se ignoran.

    pos += 46 + largoNombre + largoExtra + largoComentario;
  }

  return archivos;
}

// ---------------------------------------------------------------- XML

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function desescapar(texto) {
  return texto.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e) => {
    if (ENTIDADES[e]) return ENTIDADES[e];
    if (e[0] === '#') {
      const cod = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(cod);
    }
    return _;
  });
}

function leerSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    // Un <si> puede venir partido en varios <r><t>…</t></r> cuando la celda tiene
    // formato mezclado; se concatenan todos los <t>.
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desescapar(t[1])).join(''),
  );
}

/** 'AB' → 28 (1-based, como las columnas de Excel). */
export function columnaANumero(letras) {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** 28 → 'AB' */
export function numeroAColumna(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/**
 * Excel guarda las fechas como días desde 1899-12-30 (el -30 absorbe el bug del año
 * 1900 bisiesto que Excel arrastra por compatibilidad con Lotus 1-2-3).
 */
export function serialAFecha(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Math.round(n * 86400000);
  const base = Date.UTC(1899, 11, 30);
  const d = new Date(base + ms);
  // Se devuelve en hora local para que no se corra un día al formatear.
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ---------------------------------------------------------------- API

/**
 * @typedef {{ valor: string, esNumero: boolean, esFecha: boolean }} Celda
 * @typedef {Map<string, Celda>} Grilla  clave 'A1', 'AB12'
 */

/**
 * Lee la primera hoja de un .xlsx y devuelve una grilla de celdas.
 * @param {string} ruta
 * @returns {{ grilla: Grilla, filas: number[], nombreHoja: string }}
 */
export function leerHoja(ruta) {
  const archivos = leerZip(fs.readFileSync(ruta));

  const workbook = archivos.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const nombreHoja = (workbook.match(/<sheet[^>]*name="([^"]*)"/) || [])[1] ?? 'Hoja1';

  const strings = leerSharedStrings(archivos.get('xl/sharedStrings.xml')?.toString('utf8'));

  // Se toma la primera hoja: estas planillas tienen una sola.
  const claveHoja = [...archivos.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort()[0];
  if (!claveHoja) throw new Error('El archivo no tiene ninguna hoja');

  const xml = archivos.get(claveHoja).toString('utf8');
  const grilla = new Map();
  const filas = new Set();

  // Contempla celdas auto-cerradas (<c r="A1" s="2"/>) además de las que traen valor.
  // Si se ignora ese caso, el regex se come el valor de la celda siguiente.
  const re = /<c\s+r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

  for (const m of xml.matchAll(re)) {
    const [, col, fila, atributos, cuerpo = ''] = m;
    const tipo = (atributos.match(/\st="([^"]+)"/) || [])[1];
    const estilo = (atributos.match(/\ss="(\d+)"/) || [])[1];

    let valor;
    if (tipo === 'inlineStr') {
      valor = [...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desescapar(t[1])).join('');
    } else {
      const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (v === undefined) continue;
      valor = tipo === 's' ? (strings[Number(v)] ?? '') : desescapar(v);
    }

    if (valor === undefined || String(valor).trim() === '') continue;

    const esNumero = tipo !== 's' && tipo !== 'inlineStr' && tipo !== 'str'
      && Number.isFinite(Number(valor));

    grilla.set(`${col}${fila}`, {
      valor: String(valor),
      esNumero,
      // El estilo diría si está formateado como fecha; no se resuelve acá porque estas
      // planillas usan una sola celda de fecha y el llamador ya sabe cuál es.
      estilo: estilo ? Number(estilo) : null,
    });
    filas.add(Number(fila));
  }

  return {
    grilla,
    filas: [...filas].sort((a, b) => a - b),
    nombreHoja,
  };
}

/** Valor crudo de una celda, o '' si está vacía. */
export function celda(grilla, ref) {
  return grilla.get(ref)?.valor ?? '';
}
