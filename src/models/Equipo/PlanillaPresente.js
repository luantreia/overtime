import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * PlanillaPresente - Un jugador presente en el partido según la planilla del equipo.
 *
 * `jugadorPartido` es el puente hacia lo oficial: si la organización ya cargó la
 * convocatoria, la planilla referencia esa fila y la reutiliza; si no existe, queda
 * en null y recién se crea al oficializar. Eso hace que la planilla sirva igual para
 * el caso "no hay nada cargado" y para el caso "hay presentes pero nadie cargó stats".
 */
const planillaPresenteSchema = new Schema({
  planilla: { type: Schema.Types.ObjectId, ref: 'PlanillaEquipo', required: true, index: true },
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true },

  jugadorPartido: { type: Schema.Types.ObjectId, ref: 'JugadorPartido', default: null },

  numero: { type: Number, min: 0, max: 99 },
  rol: { type: String, enum: ['jugador', 'entrenador'], default: 'jugador' },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

planillaPresenteSchema.index({ planilla: 1, jugador: 1 }, { unique: true });

export default model('PlanillaPresente', planillaPresenteSchema);
