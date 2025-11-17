import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const participacionTemporadaSchema = new Schema({
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
  temporada: { type: Schema.Types.ObjectId, ref: 'Temporada', required: true },

  estado: { type: String, enum: ['activo', 'baja', 'expulsado'], default: 'activo' },
  observaciones: { type: String, trim: true, default: '' },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

// Índice único para evitar duplicados de equipo-temporada
participacionTemporadaSchema.index({ equipo: 1, temporada: 1 }, { unique: true });

export default model('ParticipacionTemporada', participacionTemporadaSchema);
