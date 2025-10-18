import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** EstadisticasJugadorPartido **/
const estadisticasJugadorPartidoSchema = new Schema({
  jugadorPartido: { type: Schema.Types.ObjectId, ref: 'JugadorPartido', required: true, unique: true },

  throws: { type: Number, default: 0 },
  hits: { type: Number, default: 0 },
  outs: { type: Number, default: 0 },
  catches: { type: Number, default: 0 },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

export default model('EstadisticasJugadorPartido', estadisticasJugadorPartidoSchema);