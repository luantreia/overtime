// scripts/lib/normalizarPlanilla.js
//
// Traduce un CSV de planilla "como lo tenga el club" a la forma canónica que entiende
// el importador. Toda la tolerancia a formatos vive acá: el importador de arriba
// trabaja siempre con la misma estructura.

import { normalizarClave } from './csv.js';

/**
 * Nombres alternativos aceptados por columna. Se comparan ya normalizados
 * (minúscula, sin acentos, no alfanuméricos → guión bajo), así que 'Nº Set',
 * 'nro. set' y 'NRO_SET' caen todos en la misma entrada.
 */
export const ALIAS_COLUMNAS = {
  fecha: ['fecha', 'date', 'dia', 'fecha_partido'],
  rival: ['rival', 'oponente', 'contra', 'equipo_rival', 'adversario', 'vs'],
  condicion: ['condicion', 'localia', 'local_visitante', 'l_v', 'lv'],
  set: ['set', 'numero_set', 'nro_set', 'n_set', 'num_set', 'nro'],
  ganadorSet: ['ganador_set', 'ganador', 'resultado_set', 'gano_set'],
  jugador: ['jugador', 'nombre', 'player', 'atleta', 'nombre_jugador', 'apellido_y_nombre'],
  throws: ['throws', 'tiros', 'lanzamientos', 'throw'],
  hits: ['hits', 'impactos', 'aciertos', 'hit'],
  outs: ['outs', 'eliminaciones', 'eliminado', 'out'],
  catches: ['catches', 'atrapadas', 'capturas', 'catch'],
  survive: ['survive', 'sobrevive', 'sobrevivio', 'superviviente'],
};

/**
 * Mapea las columnas presentes en el archivo a los campos canónicos.
 * @returns {{mapa: Record<string,string>, faltantes: string[]}}
 */
export function resolverColumnas(cabecera) {
  const presentes = new Set(cabecera.filter(Boolean));
  const mapa = {};

  for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
    const encontrada = alias.map(normalizarClave).find((a) => presentes.has(a));
    if (encontrada) mapa[campo] = encontrada;
  }

  // Sin estas cuatro no hay planilla posible. `set` y `ganadorSet` son opcionales:
  // su ausencia significa modo 'directa' (totales del partido, sin desglose).
  const obligatorias = ['fecha', 'rival', 'jugador'];
  const faltantes = obligatorias.filter((c) => !mapa[c]);

  return { mapa, faltantes };
}

const enteroNoNegativo = (valor) => {
  const n = Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
};

const VERDADEROS = new Set(['1', 'si', 'sí', 'true', 'x', 'v', 'yes', 'verdadero']);

const aBooleano = (valor) => VERDADEROS.has(String(valor ?? '').trim().toLowerCase());

/**
 * Fecha tolerante: acepta ISO (2026-08-15), y d/m/a y m/d/a con barras o guiones.
 * Devuelve null si no se puede interpretar — el importador lo reporta en vez de
 * inventar una fecha, porque una fecha mal leída matchea el partido equivocado.
 */
export function parsearFecha(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  const iso = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const [, a, m, d] = iso;
    return new Date(Number(a), Number(m) - 1, Number(d));
  }

  const dmy = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmy) {
    const [, primero, segundo, anioRaw] = dmy;
    const anio = anioRaw.length === 2 ? 2000 + Number(anioRaw) : Number(anioRaw);
    // Formato argentino: día primero. Si el primer número es > 12 no hay ambigüedad;
    // si los dos son <= 12 se asume d/m, que es la convención local.
    const dia = Number(primero);
    const mes = Number(segundo);
    if (dia > 31 || mes > 12) return null;
    return new Date(anio, mes - 1, dia);
  }

  const fallback = new Date(texto);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

const GANADORES = {
  local: 'local',
  l: 'local',
  visitante: 'visitante',
  v: 'visitante',
  empate: 'empate',
  e: 'empate',
  // Desde la planilla del club lo natural es escribir si ganaron ellos o el rival.
  // El importador traduce esto a local/visitante según de qué lado jugó el equipo.
  nosotros: 'propio',
  ganamos: 'propio',
  ganado: 'propio',
  g: 'propio',
  rival: 'rival',
  perdimos: 'rival',
  perdido: 'rival',
  p: 'rival',
};

export function parsearGanador(valor) {
  const clave = normalizarClave(valor);
  if (!clave) return null;
  return GANADORES[clave] ?? null;
}

/** Para comparar nombres de personas y equipos escritos a mano. */
export function normalizarNombre(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matchea un nombre escrito a mano contra una lista de candidatos.
 *
 * Devuelve el candidato solo si hay UNA coincidencia. Con cero o con varias devuelve
 * null y el motivo: adivinar acá significa cargarle las estadísticas de un partido al
 * jugador equivocado, y eso es peor que no importar la fila.
 *
 * @param {string} nombre
 * @param {Array<{nombre: string}>} candidatos
 * @returns {{match: any, motivo: null} | {match: null, motivo: 'sin-coincidencia'|'ambiguo', opciones?: string[]}}
 */
export function matchearNombre(nombre, candidatos) {
  const buscado = normalizarNombre(nombre);
  if (!buscado) return { match: null, motivo: 'sin-coincidencia' };

  // Un jugador se puede nombrar de varias formas: alias y nombre completo. La UI
  // muestra el alias cuando existe, así que un candidato con alias "Sugar" tiene
  // invisible su "Matias Zayas" — y la planilla puede traer cualquiera de los dos.
  const etiquetas = (c) => (Array.isArray(c.nombres) && c.nombres.length ? c.nombres : [c.nombre]);

  const exactos = candidatos.filter((c) => etiquetas(c).some((e) => normalizarNombre(e) === buscado));
  if (exactos.length === 1) return { match: exactos[0], motivo: null };
  if (exactos.length > 1) {
    return { match: null, motivo: 'ambiguo', opciones: exactos.map((c) => c.nombre) };
  }

  // Sin exacto: se prueba por tokens, para tolerar orden invertido ("Pérez Juan")
  // y nombres incompletos ("Juan" sí, si es único).
  //
  // La dirección candidato ⊆ buscado exige que el candidato tenga al menos DOS tokens.
  // Con uno solo, un alias corto se traga cualquier nombre que lo contenga: el alias
  // "Mati" (de Matías Giménez) matcheaba "MATI ZAYAS", que es otra persona, y como era
  // la única coincidencia el matcheo la daba por buena. Un token suelto solo puede
  // matchear por igualdad exacta, que ya se resolvió arriba.
  const tokens = buscado.split(' ').filter(Boolean);
  const parciales = candidatos.filter((c) => etiquetas(c).some((e) => {
    const candTokens = normalizarNombre(e).split(' ').filter(Boolean);
    if (!candTokens.length) return false;
    const buscadoDentroDelCandidato = tokens.every((t) => candTokens.includes(t));
    const candidatoDentroDelBuscado = candTokens.length > 1
      && candTokens.every((t) => tokens.includes(t));
    return buscadoDentroDelCandidato || candidatoDentroDelBuscado;
  }));

  if (parciales.length === 1) return { match: parciales[0], motivo: null };
  if (parciales.length > 1) {
    return { match: null, motivo: 'ambiguo', opciones: parciales.map((c) => c.nombre) };
  }

  return { match: null, motivo: 'sin-coincidencia' };
}

/**
 * Convierte las filas crudas del CSV a filas canónicas.
 * Los errores se acumulan en vez de cortar: se reporta todo el archivo de una,
 * así se corrige una vez y no de a un problema por corrida.
 */
export function normalizarFilas(filasCrudas, mapa) {
  const filas = [];
  const errores = [];

  for (const cruda of filasCrudas) {
    const linea = cruda.__linea;
    const fecha = parsearFecha(cruda[mapa.fecha]);
    const rival = String(cruda[mapa.rival] ?? '').trim();
    const jugador = String(cruda[mapa.jugador] ?? '').trim();

    if (!fecha) {
      errores.push({ linea, error: `Fecha ilegible: "${cruda[mapa.fecha] ?? ''}"` });
      continue;
    }
    if (!rival) { errores.push({ linea, error: 'Falta el rival' }); continue; }
    if (!jugador) { errores.push({ linea, error: 'Falta el jugador' }); continue; }

    const numeroSet = mapa.set ? Number(cruda[mapa.set]) : null;
    if (mapa.set && (!Number.isFinite(numeroSet) || numeroSet < 1)) {
      errores.push({ linea, error: `Set inválido: "${cruda[mapa.set]}"` });
      continue;
    }

    filas.push({
      linea,
      fecha,
      rival,
      condicion: mapa.condicion ? normalizarClave(cruda[mapa.condicion]) : null,
      numeroSet: mapa.set ? numeroSet : null,
      ganadorSet: mapa.ganadorSet ? parsearGanador(cruda[mapa.ganadorSet]) : null,
      jugador,
      throws: mapa.throws ? enteroNoNegativo(cruda[mapa.throws]) : 0,
      hits: mapa.hits ? enteroNoNegativo(cruda[mapa.hits]) : 0,
      outs: mapa.outs ? enteroNoNegativo(cruda[mapa.outs]) : 0,
      catches: mapa.catches ? enteroNoNegativo(cruda[mapa.catches]) : 0,
      survive: mapa.survive ? aBooleano(cruda[mapa.survive]) : false,
    });
  }

  return { filas, errores };
}
