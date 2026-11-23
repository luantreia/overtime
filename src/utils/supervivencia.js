/**
 * Supervivencia: quién está en cancha en cada momento de un set, a partir de las marcas
 * (EventoSet) sobre la alineación. Funciones puras; la misma lógica que el panel de análisis
 * (realtime-cv-platform, public/shared/supervivencia.js) y que `overtime-kit`.
 *
 * jugadores: [{ id, lado }]   — `lado` es el id del equipo
 * eventos:   [{ id, t, tipo, jugador, motivo?, por?, entra? }]
 */

/** → [{ id, lado, entra?, tramos: [[desde, hasta|null]] }] */
export function lineaDeTiempo(jugadores, eventos, inicio = 0) {
  const filas = new Map(jugadores.map((j) => [String(j.id), { ...j, id: String(j.id), tramos: [[inicio, null]] }]));
  const ordenados = [...(eventos || [])].sort((a, b) => a.t - b.t);
  for (const e of ordenados) {
    const f = filas.get(String(e.jugador));
    if (!f) continue;
    const abierto = f.tramos.length > 0 && f.tramos[f.tramos.length - 1][1] == null;
    if ((e.tipo === 'out' || e.tipo === 'cambio') && abierto) f.tramos[f.tramos.length - 1][1] = e.t;
    if (e.tipo === 'reingreso' && !abierto) f.tramos.push([e.t, null]);
    if (e.tipo === 'cambio' && e.entra) {
      const k = String(e.entra);
      const ya = filas.get(k);
      if (ya) ya.tramos.push([e.t, null]);
      else filas.set(k, { id: k, lado: f.lado, entra: true, tramos: [[e.t, null]] });
    }
  }
  return [...filas.values()];
}

export const estaVivo = (fila, t) => fila.tramos.some(([a, b]) => t >= a - 1e-6 && (b == null || t < b));

export function vivosPorLado(filas, t) {
  const n = {};
  for (const f of filas) {
    n[f.lado] = (n[f.lado] || 0) + (estaVivo(f, t) ? 1 : 0);
  }
  return n;
}

/**
 * Estadísticas por jugador derivadas de las marcas.
 * `fin`: segundo en que terminó el set (para "sobrevivió"); sin él, cuenta como vivo quien
 * no tiene un tramo cerrado al final.
 * → Map<jugadorId, { outs, hits, catches, outsPorMotivo, reingresos, sobrevive }>
 */
export function estadisticasDesdeEventos(jugadores, eventos, { inicio = 0, fin = null } = {}) {
  const filas = lineaDeTiempo(jugadores, eventos, inicio);
  const out = new Map();
  const base = () => ({ outs: 0, hits: 0, catches: 0, reingresos: 0, outsPorMotivo: { hit: 0, catch: 0, linea: 0, otro: 0 }, sobrevive: false });
  for (const f of filas) out.set(f.id, base());
  for (const e of eventos || []) {
    const j = out.get(String(e.jugador));
    if (e.tipo === 'out' && j) {
      j.outs += 1;
      if (e.motivo) j.outsPorMotivo[e.motivo] += 1;
    }
    if (e.tipo === 'reingreso' && j) j.reingresos += 1;
    if (e.tipo === 'out' && e.por) {
      const p = out.get(String(e.por));
      if (p && e.motivo === 'hit') p.hits += 1;
      if (p && e.motivo === 'catch') p.catches += 1;
    }
  }
  for (const f of filas) {
    const ultimo = f.tramos[f.tramos.length - 1];
    out.get(f.id).sobrevive = fin != null ? estaVivo(f, fin - 0.01) : ultimo[1] == null;
  }
  return out;
}
