/**
 * Aprobación parcial de solicitudes: quien aprueba elige qué partes de lo propuesto incorporar.
 * Lo no elegido se descarta (la solicitud se cierra igual, con registro de qué quedó afuera).
 *
 * Funciones puras: reciben la `seleccion` que manda el frontend y lo que trae la solicitud, y
 * devuelven qué aplicar. Sin `seleccion` (o null) todo se aprueba como antes: el comportamiento
 * por defecto no cambia para quien no usa la elección.
 *
 * Un id que no pertenece a la solicitud se ignora: una selección manipulada no puede sumar
 * cosas que la solicitud no traía, sólo quitar.
 */

const ids = (arr) => new Set((Array.isArray(arr) ? arr : []).map(String));

/**
 * Planilla de equipo (oficialización o reconciliación).
 *
 * seleccion: {
 *   presentes?: string[]   // PlanillaPresente a incorporar: su convocatoria y sus estadísticas
 *   sets?: boolean         // incorporar los sets de la planilla (crear los que falten)
 *   pisarSets?: number[]   // sets que YA existen en el partido y toman el resultado de la planilla
 * }
 *
 * @param {object|null|undefined} seleccion
 * @param {{ presentes: { _id: any }[], sets: { numeroSet: number }[] }} planilla
 */
export function seleccionPlanilla(seleccion, { presentes, sets }) {
  const todosPresentes = presentes.map((p) => String(p._id));
  const numeros = sets.map((s) => s.numeroSet);

  const elegidos = seleccion?.presentes === undefined || seleccion === null
    ? new Set(todosPresentes)
    : new Set([...ids(seleccion.presentes)].filter((id) => todosPresentes.includes(id)));
  const incluirSets = seleccion?.sets !== false;
  const pisarSets = new Set(
    incluirSets && Array.isArray(seleccion?.pisarSets)
      ? seleccion.pisarSets.map(Number).filter((n) => numeros.includes(n))
      : [],
  );

  const descartados = todosPresentes.filter((id) => !elegidos.has(id));
  const parcial = descartados.length > 0 || (!incluirSets && numeros.length > 0);
  return {
    presentes: elegidos,
    incluirSets,
    pisarSets,
    resumen: parcial
      ? {
          incorporado: { presentes: elegidos.size, sets: incluirSets ? numeros.length : 0, setsPisados: [...pisarSets] },
          descartado: { presentes: descartados, sets: incluirSets ? [] : numeros },
        }
      : null,
  };
}

/**
 * Lote de estadísticas de un set: qué filas se publican. Las no elegidas quedan rechazadas.
 * seleccion: { statIds?: string[] }
 */
export function seleccionLote(seleccion, statIds) {
  const todas = (statIds || []).map(String);
  if (!seleccion || seleccion.statIds === undefined) return { publicar: todas, rechazar: [], resumen: null };
  const elegidas = ids(seleccion.statIds);
  const publicar = todas.filter((id) => elegidas.has(id));
  const rechazar = todas.filter((id) => !elegidas.has(id));
  return {
    publicar,
    rechazar,
    resumen: rechazar.length ? { incorporado: { statIds: publicar }, descartado: { statIds: rechazar } } : null,
  };
}

/** Grupos de campos de un contrato que se eligen juntos (fechas van de a par). */
export const GRUPOS_CONTRATO = {
  rol: ['rol'],
  foto: ['foto'],
  fechas: ['fechaInicio', 'fechaFin', 'desde', 'hasta'],
  estado: ['estado'],
};

/**
 * Edición de contrato: qué grupos de cambios aplicar.
 * seleccion: { campos?: ('rol'|'foto'|'fechas'|'estado')[] }
 */
export function seleccionCamposContrato(seleccion, cambios) {
  const datos = cambios || {};
  const presentes = Object.keys(GRUPOS_CONTRATO).filter((g) => GRUPOS_CONTRATO[g].some((k) => datos[k] !== undefined));
  if (!seleccion || seleccion.campos === undefined) return { cambios: datos, resumen: null };
  const elegidos = new Set((seleccion.campos || []).filter((g) => presentes.includes(g)));
  const filtrado = {};
  for (const g of elegidos) for (const k of GRUPOS_CONTRATO[g]) if (datos[k] !== undefined) filtrado[k] = datos[k];
  const descartados = presentes.filter((g) => !elegidos.has(g));
  return {
    cambios: filtrado,
    resumen: descartados.length ? { incorporado: { campos: [...elegidos] }, descartado: { campos: descartados } } : null,
  };
}
