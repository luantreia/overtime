/**
 * Reloj de juego (el del reglamento: dos tiempos que cuentan para atrás y se frenan en time outs
 * y revisiones). Es distinto del reloj del video: no ubica marcas, sirve para dirigir el partido
 * y para saber en qué minuto de juego pasó algo.
 *
 * Overtime-Partido lo maneja (services/TimerManager.js) y cada cambio queda en
 * `Partido.relojJuego` con la hora real del servidor. Con eso y `Partido.relojEnVivo`
 * (hora real ↔ segundo del video) se sabe el minuto de juego de cualquier momento del video.
 * Funciones puras; la misma cuenta está en overtime-kit (captura/reloj.ts).
 */

export const DURACION_TIEMPO_DEFAULT_MIN = 20;

const valida = (x) => Number.isFinite(x) && x > 0;

/**
 * Duración de cada tiempo, en segundos. Manda lo más específico: partido > fase > competencia.
 * Sin nada cargado, 20 minutos.
 */
export function resolverDuracionTiempo({ partido, fase, competencia } = {}) {
  const min = [partido?.duracionTiempoMinutos, fase?.configuracion?.duracionTiempoMinutos, competencia?.duracionTiempoMinutos]
    .find(valida);
  return Math.round((min ?? DURACION_TIEMPO_DEFAULT_MIN) * 60);
}

/**
 * Estado del reloj de juego a una hora real, según los registros (ordenados o no).
 * → { periodo, restante, corriendo } | null si a esa hora todavía no había arrancado.
 * `restante` en segundos, nunca negativo.
 */
export function tiempoDeJuegoEnHora(registros, hora) {
  const h = new Date(hora).getTime();
  const previos = (registros || [])
    .filter((r) => new Date(r.hora).getTime() <= h)
    .sort((a, b) => new Date(a.hora).getTime() - new Date(b.hora).getTime());
  if (!previos.some((r) => r.tipo === 'inicio')) return null;
  const ultimo = previos[previos.length - 1];
  const corriendo = ultimo.tipo === 'inicio' || ultimo.tipo === 'reanuda' || (ultimo.tipo === 'ajuste' && ultimo.corriendo);
  const transcurrido = corriendo ? (h - new Date(ultimo.hora).getTime()) / 1000 : 0;
  return { periodo: ultimo.periodo, restante: Math.max(0, Math.round((ultimo.restante - transcurrido) * 10) / 10), corriendo };
}
