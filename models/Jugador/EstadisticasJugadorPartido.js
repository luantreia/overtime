import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** EstadisticasJugadorPartido **/
const estadisticasJugadorPartidoSchema = new Schema({
  jugadorPartido: { type: Schema.Types.ObjectId, ref: 'JugadorPartido', required: true, unique: true },

  throws: { type: Number, default: 0 },
  hits: { type: Number, default: 0 },
  outs: { type: Number, default: 0 },
  catches: { type: Number, default: 0 },

  // Nuevo: Control de tipo de captura
  tipoCaptura: {
    type: String,
    enum: ['manual', 'automatica', 'mixta'],
    default: 'automatica'
  },
  fuente: { type: String, default: 'sistema' }, // 'captura-directa', 'calculo-sets', etc.
  ultimaActualizacion: { type: Date, default: Date.now },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

export default model('EstadisticasJugadorPartido', estadisticasJugadorPartidoSchema);