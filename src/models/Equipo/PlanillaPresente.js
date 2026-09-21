import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * PlanillaPresente - Un jugador presente en el partido según la planilla del equipo.
 *
 * `jugadorPartido` es el puente hacia lo oficial: si la organización ya cargó la
 * convocatoria, la planilla referencia esa fila y la reutiliza; si no existe, queda
 * en null y recién se crea al oficializar. Eso hace que la planilla sirva igual para
 * el caso "no hay nada cargado" y para el caso "hay presentes pero nadie cargó stats".
 *
 * `equipo` es de qué plantel sale este presente — no necesariamente el dueño de la
 * planilla. Desde que la planilla puede capturar también al rival (o, en modo
 * scouting, a los dos equipos de un partido ajeno), un presente ya no es siempre "del
 * dueño": puede ser local o visitante del partido. La oficialización usa este campo
 * para saber a nombre de qué equipo escribir cada fila (ver planillaOficializacionService.js).
 *
 * `required: false` por ahora a propósito: hay documentos existentes sin este campo.
 * Se backfillea con overtime/scripts/backfill-planilla-presente-equipo.js (asumiendo
 * que todo presente viejo es del equipo dueño de su planilla, la única opción que
 * existía antes de este cambio) y recién después se pasa a `required: true`.
 */
const planillaPresenteSchema = new Schema({
  planilla: { type: Schema.Types.ObjectId, ref: 'PlanillaEquipo', required: true, index: true },
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true },
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: false, index: true },

  jugadorPartido: { type: Schema.Types.ObjectId, ref: 'JugadorPartido', default: null },

  numero: { type: Number, min: 0, max: 99 },
  rol: { type: String, enum: ['jugador', 'entrenador'], default: 'jugador' },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

planillaPresenteSchema.index({ planilla: 1, jugador: 1 }, { unique: true });

export default model('PlanillaPresente', planillaPresenteSchema);
