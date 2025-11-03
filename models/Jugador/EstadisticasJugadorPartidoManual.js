import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** EstadisticasJugadorPartidoManual - Estadísticas ingresadas manualmente **/
const estadisticasJugadorPartidoManualSchema = new Schema({
  jugadorPartido: { type: Schema.Types.ObjectId, ref: 'JugadorPartido', required: true, unique: true },

  // Estadísticas básicas (iguales que el modelo automático)
  throws: { type: Number, default: 0 },
  hits: { type: Number, default: 0 },
  outs: { type: Number, default: 0 },
  catches: { type: Number, default: 0 },

  // Metadatos específicos para datos manuales
  fuente: { type: String, default: 'ingreso-manual' },
  ultimaActualizacion: { type: Date, default: Date.now },
  notas: { type: String }, // Para agregar notas sobre el ingreso manual

  // Control de versiones (por si se editan múltiples veces)
  version: { type: Number, default: 1 },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

// Índice único para evitar duplicados por jugador-partido (comentado porque ya se define con unique: true en el campo)
// estadisticasJugadorPartidoManualSchema.index({ jugadorPartido: 1 }, { unique: true });

export default model('EstadisticasJugadorPartidoManual', estadisticasJugadorPartidoManualSchema);
