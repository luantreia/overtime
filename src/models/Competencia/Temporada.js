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
  descripcion: String,

  fechaInicio: Date,
  fechaFin: Date,

  estado: {
    type: String,
    enum: ['en_creacion', 'en_curso', 'finalizada'],
    default: 'en_creacion',
  },
  ganador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    default: null,
  },

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

export default mongoose.model('Temporada', TemporadaSchema);
