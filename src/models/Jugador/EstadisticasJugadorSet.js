import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** EstadisticasJugadorSet **/
const estadisticasJugadorSetSchema = new Schema({
  set: { type: Schema.Types.ObjectId, ref: 'SetPartido', required: true, index: true },
  jugadorPartido: { type: Schema.Types.ObjectId, ref: 'JugadorPartido', required: true },
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true },
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },

  throws: { type: Number, default: 0 },
  hits: { type: Number, default: 0 },
  outs: { type: Number, default: 0 },
  catches: { type: Number, default: 0 },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

estadisticasJugadorSetSchema.index({ set: 1, jugadorPartido: 1 }, { unique: true });

export default model('EstadisticasJugadorSet', estadisticasJugadorSetSchema);
