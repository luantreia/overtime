import mongoose from 'mongoose';

const TemporadaSchema = new mongoose.Schema({
  competencia: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competencia',
    required: true,
  },
  nombre: {
    type: String,
    required: true,
    trim: true,
  },
  año: {
    type: Number,
    required: true,
  },
  descripcion: String,

  fechaInicio: Date,
  fechaFin: Date,

  creadoPor: {
    type: String,
    ref: 'Usuario',
    required: true,
  },
  administradores: [{
    type: String,
    ref: 'Usuario',
  }]
}, { timestamps: true });

TemporadaSchema.index({ competencia: 1, año: 1 }, { unique: true });

export default mongoose.model('Temporada', TemporadaSchema);
