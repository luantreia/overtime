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
 * Lo que la consola sabe en hora real, puesto en el tiempo del partido:
 *  - cada set oficial que arrancó por la consola (iniciadoEn/finalizadoEn) y no tiene tiempo, o
 *    tiene uno de la consola sin confirmar: su tiempo.
 *  - el inicio y fin del partido marcados en vivo (ventana, origen 'en_vivo', sin confirmar).
 * No toca lo que una persona marcó o confirmó. Antes de alinear con el video los segundos son
 * provisorios (cuentan desde la primera marca en vivo); al alinear se recalculan.
 * → { sets, ventana }
 */
export async function ubicarDesdeConsola(partidoId) {
  const p = await Partido.findById(partidoId).select('relojEnVivo ventana').lean();
  if (!p?.relojEnVivo) return { sets: 0, ventana: false };
  const reloj = p.relojEnVivo;
  const seg = (h) => Math.max(0, segundoDesdeHora(reloj, h));

  const sets = await SetPartido.find({ partido: partidoId, iniciadoEn: { $ne: null } }).select('tiempo iniciadoEn finalizadoEn').lean();
  let nSets = 0;
  for (const s of sets) {
    const libre = !s.tiempo || (s.tiempo.origen === 'en_vivo' && !s.tiempo.confirmado && !s.tiempo.horaDesde);
    if (!libre || !s.finalizadoEn) continue;
    const desde = seg(s.iniciadoEn);
    await SetPartido.updateOne({ _id: s._id }, {
      $set: { tiempo: { desde, hasta: Math.max(seg(s.finalizadoEn), desde + 1), origen: 'en_vivo', confirmado: false } },
    });
    nSets += 1;
  }

  let ventana = false;
  const v = p.ventana;
  if (v && v.origen === 'en_vivo' && !v.confirmado && v.horaDesde) {
    await Partido.updateOne({ _id: partidoId }, {
      $set: { 'ventana.desde': seg(v.horaDesde), 'ventana.hasta': v.horaHasta ? seg(v.horaHasta) : null },
    });
    ventana = true;
  }
  return { sets: nSets, ventana };
}

/** La consola arrancó el partido (primer 'inicio' del 1T): abre la ventana en vivo si no hay una. */
export async function abrirVentanaEnVivo(partidoId, hora) {
  await Partido.updateOne(
    { _id: partidoId, $or: [{ ventana: null }, { ventana: { $exists: false } }] },
    { $set: { ventana: { desde: null, hasta: null, origen: 'en_vivo', confirmado: false, horaDesde: hora } } },
  );
  await ubicarDesdeConsola(partidoId);
}

/** El partido se finalizó con la ventana en vivo abierta: la cierra. */
export async function cerrarVentanaEnVivo(partidoId, hora = new Date()) {
  await Partido.updateOne(
    { _id: partidoId, 'ventana.origen': 'en_vivo', 'ventana.horaDesde': { $ne: null }, 'ventana.horaHasta': { $in: [null, undefined] } },
    { $set: { 'ventana.horaHasta': hora } },
  );
  await ubicarDesdeConsola(partidoId);
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
  // Los sets y la ventana que vienen de la consola (sin hora propia de captura) también se corren.
  const consola = await ubicarDesdeConsola(partidoId);
  return { reloj, marcas: eventos.length, sets: nSets + consola.sets };
}
