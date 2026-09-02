// services/categoriaElegibilidadService.js
//
// Regla única de elegibilidad por categoría de competencia. La usan tanto la carga de
// estadísticas de un partido como la lista de buena fe, así que tiene que vivir en un
// solo lugar: si divergen, un jugador es elegible para la lista pero no para el
// partido, o al revés.
//
// OJO con el choque de vocabularios, que es la trampa de este código:
//   Competencia.categoria → 'Masculino' | 'Femenino' | 'Mixto' | 'Libre'   (capitalizado)
//   Jugador.genero        → 'masculino' | 'femenino' | 'otro'              (minúscula)
// Comparar sin normalizar no falla: simplemente no excluye a nadie nunca.

const CATEGORIAS_RESTRICTIVAS = {
  masculino: 'femenino',
  femenino: 'masculino',
};

/** 'Masculino' → 'masculino'. Devuelve null si no viene nada. */
export function normalizarCategoria(categoria) {
  if (typeof categoria !== 'string' || !categoria.trim()) return null;
  return categoria.trim().toLowerCase();
}

/**
 * ¿Este jugador puede jugar en esta categoría?
 *
 * Solo se excluye el género explícitamente opuesto. Un jugador con genero 'otro' pasa
 * en cualquier categoría, y eso es deliberado: 'otro' es el DEFAULT del schema de
 * Jugador, así que la mayoría de los jugadores cargados sin completar el dato lo
 * tienen. Excluirlos por coincidencia exacta vaciaría planteles enteros sin que nadie
 * entienda por qué.
 *
 * @param {string|null|undefined} categoriaCompetencia
 * @param {string|null|undefined} generoJugador
 * @returns {boolean}
 */
export function jugadorElegiblePorCategoria(categoriaCompetencia, generoJugador) {
  const categoria = normalizarCategoria(categoriaCompetencia);
  if (!categoria) return true;

  const generoExcluido = CATEGORIAS_RESTRICTIVAS[categoria];
  if (!generoExcluido) return true; // mixto, libre, o cualquier valor futuro

  const genero = normalizarCategoria(generoJugador);
  if (!genero) return true;

  return genero !== generoExcluido;
}

/** ¿La categoría llega a filtrar a alguien, o acepta a todos? */
export function categoriaRestringe(categoriaCompetencia) {
  const categoria = normalizarCategoria(categoriaCompetencia);
  return Boolean(categoria && CATEGORIAS_RESTRICTIVAS[categoria]);
}

/**
 * Filtro de Mongo equivalente, para no traer de la base lo que igual vamos a descartar.
 * Incluye los documentos sin `genero` — el campo tiene default, pero un documento viejo
 * puede no tenerlo, y no queremos que desaparezca de la lista por eso.
 */
export function filtroMongoPorCategoria(categoriaCompetencia, campo = 'genero') {
  const categoria = normalizarCategoria(categoriaCompetencia);
  const generoExcluido = categoria ? CATEGORIAS_RESTRICTIVAS[categoria] : null;
  if (!generoExcluido) return null;

  return { [campo]: { $ne: generoExcluido } };
}
