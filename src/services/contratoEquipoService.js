import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';

/**
 * La regla de cuándo dos contratos de un jugador con un equipo se pisan.
 *
 * POR QUÉ NO ALCANZA UN ÍNDICE ÚNICO
 *
 * Lo natural sería un índice único {jugador, equipo} y listo, pero sería incorrecto: un jugador
 * puede irse y volver, y eso son dos contratos legítimos con períodos distintos. Lo que está
 * mal no es tener dos, es tener dos que describen el MISMO período. Mongo no puede expresar
 * "sin rangos solapados" como índice, así que la regla vive en la aplicación.
 *
 * QUÉ ROMPÍA NO TENERLA
 *
 * `POST /jugador-equipo` chequeaba `estado: 'aceptado'`, que falla en las dos direcciones: no
 * detecta un duplicado si el otro contrato está en otro estado, y bloquea volver a fichar a un
 * jugador cuyo contrato venció —porque sigue estando 'aceptado'—. La aprobación de una
 * solicitud `jugador-equipo-crear` directamente no chequeaba nada. Entre los dos caminos se
 * creaban contratos superpuestos, y esos duplicados hacían fallar la convocatoria de
 * entrenamientos con un 500.
 */

/**
 * Un `desde` vacío se trata como "desde siempre" y un `hasta` vacío como "sin fin". Es lo que
 * corresponde: un contrato abierto está vigente hasta que alguien lo cierre, no hasta hoy.
 */
const rango = (contrato) => ({
  desde: contrato?.desde ? new Date(contrato.desde).getTime() : -Infinity,
  hasta: contrato?.hasta ? new Date(contrato.hasta).getTime() : Infinity,
});

/** ¿Dos períodos se pisan aunque sea un día? */
export function seSolapan(a, b) {
  const ra = rango(a);
  const rb = rango(b);
  return ra.desde <= rb.hasta && rb.desde <= ra.hasta;
}

/**
 * El contrato existente que se pisaría con uno nuevo, o `null` si no hay ninguno.
 *
 * Los contratos dados de baja NO cuentan: dar de baja es la forma de cerrar un vínculo, y si
 * bloquearan una nueva alta no habría manera de volver a fichar a alguien que se fue.
 *
 * `excluirId` sirve al editar un contrato, para que no choque consigo mismo.
 */
export async function contratoSolapado({ jugador, equipo, desde, hasta, excluirId = null, session = null }) {
  const filtro = { jugador, equipo, estado: { $ne: 'baja' } };
  if (excluirId) filtro._id = { $ne: excluirId };

  const consulta = JugadorEquipo.find(filtro).select('desde hasta estado');
  if (session) consulta.session(session);
  const existentes = await consulta.lean();

  return existentes.find((existente) => seSolapan(existente, { desde, hasta })) ?? null;
}

/** Mensaje para el usuario, con las fechas del contrato que estorba. */
export function mensajeSolapamiento(existente) {
  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
  const desde = fmt(existente.desde);
  const hasta = fmt(existente.hasta);

  if (desde && hasta) return `El jugador ya tiene un contrato con este equipo del ${desde} al ${hasta}.`;
  if (desde) return `El jugador ya tiene un contrato abierto con este equipo desde el ${desde}.`;
  return 'El jugador ya tiene un contrato vigente con este equipo.';
}
