// scripts/lib/parsearPlanillaMoran.js
//
// Lee las planillas de Excel del club y las convierte a filas canónicas.
//
// El layout es una matriz: los sets van en columnas (de a dos, porque hay una columna
// separadora), y cada jugador ocupa un bloque de 5 filas — T, H, O, C, S.
//
// Ninguno de los archivos reales es igual a otro, así que NADA se busca por posición
// fija. Variantes encontradas en los 6 archivos de Morán masculino cloth:
//
//   - El rival puede estar en la celda de al lado del rótulo (D2 o E2, cambia por
//     archivo) o embebido en el propio rótulo: "PARTIDO VS: HOKORY".
//   - La fecha puede ser un serial de Excel (46131) o texto ("10/05/26").
//   - Las filas SET y RESULTADO pueden venir en cualquier orden.
//   - Las columnas de sets arrancan en B o en C.
//   - Los resultados vienen en mayúscula o minúscula, con espacios sobrantes.
//   - Puede haber un set rotulado "ET" en el medio de la numeración.
//   - Las celdas pueden traer el número solo (3), con decimal (3.0), con el rótulo
//     adentro ("T: 3", "T:") o con una anotación al lado ("1 LC").
//
// Por eso todo se localiza buscando rótulos y todo valor se extrae tolerantemente.

import { celda, columnaANumero, numeroAColumna, serialAFecha } from './xlsx.js';

/** Orden fijo de las 5 filas de cada bloque de jugador. */
const CAMPOS_BLOQUE = ['throws', 'hits', 'outs', 'catches', 'survive'];

const LARGO_BLOQUE = CAMPOS_BLOQUE.length;

/** Textos de la columna A que son estructura, no nombres de jugador. */
const ROTULOS_ESTRUCTURA = [
  /^set$/i,
  /resultado/i,
  /^total/i,
  /partido\s*vs/i,
  /^fecha/i,
  /^categoria/i,
  /^pelota/i,
  /planilla\s+de\s+estad/i,
];

const esRotuloEstructura = (texto) =>
  ROTULOS_ESTRUCTURA.some((re) => re.test(String(texto).trim()));

/**
 * Extrae el primer número de una celda.
 * "3" → 3 · "3.0" → 3 · "T: 3" → 3 · "1 LC" → 1 · "T:" → 0 · "" → 0
 * Devuelve además si había texto sobrante, para poder avisar de celdas raras.
 */
export function extraerNumero(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return { numero: 0, sospechosa: false };

  const m = texto.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return { numero: 0, sospechosa: texto.length > 0 && !/^[a-z:\s]*$/i.test(texto) };

  const numero = Math.max(0, Math.round(Number(m[0].replace(',', '.'))));
  // "T: 3" es normal en estos archivos; "1 LC" no, y conviene que el usuario lo mire.
  const resto = texto.replace(m[0], '').replace(/^[thocs]\s*:?\s*/i, '').trim();
  return { numero, sospechosa: resto.length > 0 };
}

/** La fila de survive marca con una X. */
const esMarca = (valor) => /^[xX✓v]$/.test(String(valor ?? '').trim());

/**
 * La columna de OUTS no es numérica: anota la CAUSA de cada out con letras.
 *
 * De 44 valores distintos en las planillas de Morán, solo dos eran números puros. El
 * resto son códigos: H (hit), C (catch), L (línea), LC (lo catchearon), LI, SE, EC,
 * SL, TA, PL, SP, E. Leerlos con un extractor numérico daba 0 outs en ~700 filas que
 * sí registraban outs.
 *
 * Reglas, confirmadas contra la notación del club:
 *   - Una letra de causa sola vale UN out:            "H" → 1, "C" → 1, "L" → 1
 *   - Con número, el número manda y la letra es causa: "1 LC" → 1, "2 LC" → 2
 *   - El rótulo de la fila sin valor no es un out:     "O" → 0, "O:" → 0
 *   - Varios outs se separan con / , o |:              "H / H" → 2, "1 | 1LC" → 2
 *   - El superíndice indica repetición:                "H²" → 2, "H2" → 2
 *   - Una letra repetida es esa causa repetida:        "hh" → 2, "cc" → 2
 *
 * @returns {{ outs: number, revisar: boolean }} `revisar` marca los casos que la regla
 *   resuelve pero conviene mirar a mano (varias causas dentro de un mismo tramo).
 */
export function extraerOuts(valor) {
  const original = String(valor ?? '').trim();
  if (!original) return { outs: 0, revisar: false };

  // El rótulo de la fila viene embebido en la celda en algunos archivos ("O: H").
  let texto = original.replace(/^O\s*:?\s*/i, '');
  if (!texto.trim()) return { outs: 0, revisar: false };

  texto = texto.replace(/²/g, '2').replace(/³/g, '3');

  let outs = 0;
  let revisar = false;

  for (const tramo of texto.split(/[/,|]/)) {
    const t = tramo.trim();
    if (!t) continue;

    const numero = t.match(/\d+(?:[.,]\d+)?/);
    if (numero) {
      outs += Math.max(0, Math.round(Number(numero[0].replace(',', '.'))));
      continue;
    }

    const letras = t.replace(/[^a-záéíóúñ]/gi, '');
    if (!letras) continue;

    // "hh" / "cc": la misma causa anotada dos veces. Ojo que "LC" son dos letras
    // distintas que forman UN código, no dos outs.
    const repetida = letras.match(/^(.)\1+$/i);
    if (repetida) {
      outs += letras.length;
      continue;
    }

    outs += 1;
    // Dos códigos separados por espacio dentro del mismo tramo ("H SP"): se cuenta
    // como uno solo, siguiendo la regla de "1 LC", pero queda marcado.
    if (/\s/.test(t)) revisar = true;
  }

  return { outs, revisar };
}

/** 'G'/'E'/'P' (en cualquier caja, con espacios) → propio/empate/rival. */
export function parsearResultadoSet(valor) {
  const t = String(valor ?? '').trim().toUpperCase();
  if (t === 'G') return 'propio';
  if (t === 'P') return 'rival';
  if (t === 'E') return 'empate';
  return null;
}

/**
 * Busca un rótulo en las primeras filas y devuelve su valor.
 *
 * Contempla los dos estilos: valor en una celda a la derecha, o embebido en el propio
 * rótulo después de los dos puntos.
 */
function leerMetadato(grilla, filas, regexRotulo, columnasMax = 60) {
  for (const fila of filas.slice(0, 6)) {
    for (let c = 1; c <= columnasMax; c += 1) {
      const ref = `${numeroAColumna(c)}${fila}`;
      const texto = celda(grilla, ref);
      if (!texto || !regexRotulo.test(texto)) continue;

      // Estilo "PARTIDO VS: HOKORY"
      const embebido = texto.split(':').slice(1).join(':').trim();
      if (embebido) return { valor: embebido, fila, columna: c };

      // Estilo rótulo + celda a la derecha
      for (let d = c + 1; d <= columnasMax; d += 1) {
        const vecino = celda(grilla, `${numeroAColumna(d)}${fila}`);
        if (!vecino) continue;
        // Si lo próximo que aparece es otro rótulo, este metadato está vacío.
        if (/:$/.test(vecino) || esRotuloEstructura(vecino)) break;
        return { valor: vecino, fila, columna: d };
      }
      return { valor: '', fila, columna: c };
    }
  }
  return null;
}

/** Fecha desde serial de Excel o desde texto d/m/a. */
export function parsearFechaCelda(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  if (/^\d+(\.\d+)?$/.test(texto)) return serialAFecha(texto);

  const m = texto.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    const [, d, mes, aRaw] = m;
    const anio = aRaw.length === 2 ? 2000 + Number(aRaw) : Number(aRaw);
    if (Number(d) > 31 || Number(mes) > 12) return null;
    return new Date(anio, Number(mes) - 1, Number(d));
  }

  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  return null;
}

/**
 * @param {{grilla: Map, filas: number[]}} hoja
 * @param {string} nombreArchivo solo para los mensajes
 * @returns {{
 *   meta: {rival: string|null, fecha: Date|null, categoria: string|null, pelota: string|null},
 *   filas: Array<object>,
 *   avisos: string[],
 * }}
 */
export function parsearPlanilla(hoja, nombreArchivo = '') {
  const { grilla, filas: filasConDatos } = hoja;
  const avisos = [];

  // --- Metadatos -----------------------------------------------------------
  const rival = leerMetadato(grilla, filasConDatos, /partido\s*vs/i);
  const fechaMeta = leerMetadato(grilla, filasConDatos, /^fecha/i);
  const categoria = leerMetadato(grilla, filasConDatos, /^categoria/i);
  const pelota = leerMetadato(grilla, filasConDatos, /^pelota/i);

  const meta = {
    rival: rival?.valor?.trim() || null,
    fecha: parsearFechaCelda(fechaMeta?.valor),
    categoria: categoria?.valor?.trim() || null,
    pelota: pelota?.valor?.trim() || null,
  };

  if (!meta.rival) avisos.push('No se pudo leer el rival (celda "PARTIDO VS:")');
  if (!meta.fecha) {
    avisos.push(`No se pudo leer la fecha (celda "FECHA:"${fechaMeta?.valor ? `, decía "${fechaMeta.valor}"` : ' vacía'})`);
  }

  // --- Filas de estructura -------------------------------------------------
  let filaSet = null;
  let filaResultado = null;

  for (const fila of filasConDatos.slice(0, 10)) {
    for (let c = 1; c <= 3; c += 1) {
      const t = celda(grilla, `${numeroAColumna(c)}${fila}`).trim();
      if (!t) continue;
      if (filaSet === null && /^set$/i.test(t)) filaSet = fila;
      if (filaResultado === null && /resultado/i.test(t)) filaResultado = fila;
    }
  }

  if (filaSet === null) {
    avisos.push('No se encontró la fila "SET": sin ella no se pueden ubicar las columnas');
    return { meta, filas: [], avisos };
  }

  // --- Columnas de sets ----------------------------------------------------
  // Se toman de la fila SET todas las celdas con rótulo numérico. La columna TOTAL y
  // todo lo que venga después se descarta: es una suma calculada, no un set.
  const columnasSet = [];
  let columnaTotal = Infinity;

  for (let c = 2; c <= 80; c += 1) {
    const texto = celda(grilla, `${numeroAColumna(c)}${filaSet}`).trim();
    if (/^total/i.test(texto)) { columnaTotal = c; break; }
  }
  // El rótulo TOTAL a veces está en la fila de metadatos en vez de la de sets.
  for (const fila of filasConDatos.slice(0, 4)) {
    for (let c = 2; c <= 80; c += 1) {
      if (/^total/i.test(celda(grilla, `${numeroAColumna(c)}${fila}`).trim())) {
        columnaTotal = Math.min(columnaTotal, c);
      }
    }
  }

  const etiquetasNoNumericas = [];
  for (let c = 2; c < Math.min(columnaTotal, 80); c += 1) {
    const texto = celda(grilla, `${numeroAColumna(c)}${filaSet}`).trim();
    if (!texto) continue;
    const n = Number(texto);
    if (Number.isFinite(n) && n >= 1) {
      columnasSet.push({ columna: c, numeroSet: Math.round(n) });
    } else {
      etiquetasNoNumericas.push({ columna: c, etiqueta: texto });
    }
  }

  // Un set rotulado "ET" (tiempo extra) rompe la numeración. Se le da el número
  // siguiente al máximo para no pisar ningún set real, y se avisa.
  if (etiquetasNoNumericas.length) {
    let siguiente = columnasSet.reduce((max, s) => Math.max(max, s.numeroSet), 0);
    for (const { columna, etiqueta } of etiquetasNoNumericas) {
      siguiente += 1;
      columnasSet.push({ columna, numeroSet: siguiente });
      avisos.push(`El set rotulado "${etiqueta}" se importa como set ${siguiente}`);
    }
  }

  columnasSet.sort((a, b) => a.columna - b.columna);

  if (!columnasSet.length) {
    avisos.push('La fila "SET" no tiene ninguna columna con número de set');
    return { meta, filas: [], avisos };
  }

  // --- Resultado por set ---------------------------------------------------
  const resultadoPorSet = new Map();
  if (filaResultado !== null) {
    for (const { columna, numeroSet } of columnasSet) {
      const r = parsearResultadoSet(celda(grilla, `${numeroAColumna(columna)}${filaResultado}`));
      if (r) resultadoPorSet.set(numeroSet, r);
    }
  } else {
    avisos.push('No se encontró la fila "RESULTADO (G/E/P)": los sets quedan sin ganador');
  }

  // --- Bloques de jugador --------------------------------------------------
  // Un bloque arranca donde la columna A tiene un nombre (no un rótulo de estructura)
  // y ocupa 5 filas. No se busca la etiqueta T/H/O/C/S en la columna B porque en un
  // archivo esa columna es, además, la del primer set.
  const primeraFila = Math.max(filaSet, filaResultado ?? 0) + 1;
  const filasCandidatas = filasConDatos.filter((f) => f >= primeraFila);

  const outsARevisar = [];
  const filasSalida = [];
  const jugadoresVistos = new Set();

  for (const fila of filasCandidatas) {
    const nombre = celda(grilla, `A${fila}`).trim();
    if (!nombre || esRotuloEstructura(nombre)) continue;

    if (jugadoresVistos.has(nombre.toLowerCase())) {
      avisos.push(`El jugador "${nombre}" aparece más de una vez; se toma el primer bloque`);
      continue;
    }
    jugadoresVistos.add(nombre.toLowerCase());

    let celdasSospechosas = 0;

    for (const { columna, numeroSet } of columnasSet) {
      const ref = (offset) => `${numeroAColumna(columna)}${fila + offset}`;

      const valores = {};
      const crudos = {};
      let tieneAlgo = false;

      CAMPOS_BLOQUE.forEach((campo, i) => {
        const bruto = celda(grilla, ref(i));
        crudos[campo] = bruto;

        if (campo === 'survive') {
          valores.survive = esMarca(bruto);
          if (valores.survive) tieneAlgo = true;
          return;
        }

        // Los outs se anotan con códigos de causa, no con cantidades.
        if (campo === 'outs') {
          const { outs, revisar } = extraerOuts(bruto);
          if (revisar) outsARevisar.push(`${nombre} set ${numeroSet}: "${bruto}"`);
          valores.outs = outs;
          if (outs > 0) tieneAlgo = true;
          return;
        }

        const { numero, sospechosa } = extraerNumero(bruto);
        if (sospechosa) celdasSospechosas += 1;
        valores[campo] = numero;
        if (numero > 0) tieneAlgo = true;
      });

      // Un set en el que el jugador no registra nada es un set que no jugó: no se
      // inventa una fila en cero, porque eso lo contaría como presente.
      if (!tieneAlgo) continue;

      filasSalida.push({
        fecha: meta.fecha,
        rival: meta.rival,
        // La modalidad desempata cuando el equipo jugó dos veces contra el mismo rival
        // el mismo día, que en una fecha de liga es lo habitual: uno en foam y otro en
        // cloth. Sin esto el partido queda irresoluble por ambigüedad.
        pelota: meta.pelota,
        categoria: meta.categoria,
        numeroSet,
        ganadorSet: resultadoPorSet.get(numeroSet) ?? null,
        jugador: nombre,
        throws: valores.throws,
        hits: valores.hits,
        outs: valores.outs,
        catches: valores.catches,
        survive: valores.survive,
        // Los valores tal cual venían en la celda. Se conservan para poder auditar el
        // parseo sin volver a abrir el Excel: la columna de outs, por ejemplo, mezcla
        // cantidades con letras que indican la causa.
        crudos,
        origen: `${nombreArchivo} fila ${fila}`,
      });
    }

    if (celdasSospechosas) {
      avisos.push(`"${nombre}": ${celdasSospechosas} celda${celdasSospechosas === 1 ? '' : 's'} con texto además del número (ej. "1 LC")`);
    }
  }

  if (outsARevisar.length) {
    avisos.push(`Outs con mas de una causa en la misma celda (contados como 1): ${outsARevisar.slice(0, 5).join(" | ")}${outsARevisar.length > 5 ? ` y ${outsARevisar.length - 5} mas` : ""}`);
  }

  if (!filasSalida.length) avisos.push('No se encontró ningún jugador con estadísticas');

  return { meta, filas: filasSalida, avisos };
}
