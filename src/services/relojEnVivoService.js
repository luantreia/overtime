import Partido from '../models/Partido/Partido.js';
import SetPartido from '../models/Partido/SetPartido.js';
import EventoSet from '../models/Partido/EventoSet.js';

/**
 * Captura en vivo con hora real (ver relojEnVivoSchema en models/Partido/tiempoVideo.js).
 * La hora la pone el servidor al recibir la marca, no la tablet: el reloj de un kiosco puede
 * estar corrido, y la latencia de red es despreciable al lado de un tiempo muerto.
 */

const redondear = (x) => Math.round(x * 10) / 10;
const ms = (d) => new Date(d).getTime();

/** Segundo de partido de una hora real, según el reloj. Puro. */
export const segundoDesdeHora = (reloj, hora) => redondear((reloj.segundo || 0) + (ms(hora) - ms(reloj.ancla)) / 1000);

/** `segundo` nuevo para que la marca de hora `hora` quede en `segundoVideo` (la alineación). Puro. */
export const segundoParaAlinear = (reloj, hora, segundoVideo) => segundoVideo - (ms(hora) - ms(reloj.ancla)) / 1000;

/** El reloj del partido; si todavía no hay, lo crea anclado en `hora` (la primera marca en vivo). */
export async function relojDelPartido(partidoId, hora = new Date()) {
  await Partido.updateOne(
    { _id: partidoId, $or: [{ relojEnVivo: null }, { relojEnVivo: { $exists: false } }] },
    { $set: { relojEnVivo: { ancla: hora, segundo: 0, alineado: false } } },
  );
  const p = await Partido.findById(partidoId).select('relojEnVivo').lean();
  return p.relojEnVivo;
}

/**
 * Alinea las marcas en vivo del partido con el video: la marca de hora `hora` está en
 * `segundoVideo`. Recalcula `t` de todas las marcas en vivo y el tiempo en vivo de los sets.
 * → { reloj, marcas, sets }
 */
export async function alinearRelojEnVivo(partidoId, { hora, segundoVideo }) {
  const p = await Partido.findById(partidoId).select('relojEnVivo').lean();
  if (!p?.relojEnVivo) throw new Error('El partido no tiene marcas en vivo para alinear');
  const reloj = { ...p.relojEnVivo, segundo: segundoParaAlinear(p.relojEnVivo, hora, segundoVideo), alineado: true };
  // updateOne: el post('save') de Partido recalcula marcador y tabla, y esto no lo amerita.
  await Partido.updateOne({ _id: partidoId }, { $set: { relojEnVivo: reloj } });

  const eventos = await EventoSet.find({ partido: partidoId, hora: { $ne: null } }).select('hora').lean();
  if (eventos.length) {
    await EventoSet.bulkWrite(
      eventos.map((e) => ({
        updateOne: { filter: { _id: e._id }, update: { $set: { t: Math.max(0, segundoDesdeHora(reloj, e.hora)) } } },
      })),
    );
  }

  const sets = await SetPartido.find({ partido: partidoId, 'tiempo.origen': 'en_vivo' }).select('tiempo').lean();
  let nSets = 0;
  for (const s of sets) {
    const { horaDesde, horaHasta } = s.tiempo;
    if (!horaDesde && !horaHasta) continue;
    const desde = horaDesde ? Math.max(0, segundoDesdeHora(reloj, horaDesde)) : s.tiempo.desde;
    const hasta = horaHasta ? segundoDesdeHora(reloj, horaHasta) : s.tiempo.hasta;
    await SetPartido.updateOne({ _id: s._id }, { $set: { 'tiempo.desde': desde, 'tiempo.hasta': Math.max(hasta, desde + 1) } });
    nSets += 1;
  }
  return { reloj, marcas: eventos.length, sets: nSets };
}
