import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** EstadisticasJugadorPartido - Estadísticas calculadas automáticamente desde sets **/
const estadisticasJugadorPartidoSchema = new Schema({
  jugadorPartido: { type: Schema.Types.ObjectId, ref: 'JugadorPartido', required: true, unique: true },

  throws: { type: Number, default: 0 },
  hits: { type: Number, default: 0 },
  outs: { type: Number, default: 0 },
  catches: { type: Number, default: 0 },

  // Metadatos para estadísticas automáticas
  fuente: { type: String, default: 'calculo-automatico-sets' },
  ultimaActualizacion: { type: Date, default: Date.now },
  setsCalculados: { type: Number, default: 0 }, // Número de sets que contribuyeron

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

export default model('EstadisticasJugadorPartido', estadisticasJugadorPartidoSchema);