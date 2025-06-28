import mongoose from 'mongoose';

const JugadorCompetenciaSchema = new mongoose.Schema({
  jugadorEquipo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JugadorEquipo',
    required: true
  },

  equipoCompetencia: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EquipoCompetencia',
    required: true
  },

  rol: {
    type: String,
    enum: ['jugador', 'capitan', 'entrenador'],
    default: 'jugador'
  },

  dorsal: {
    type: Number,
    min: 0,
    max: 99
  },

  activo: {
    type: Boolean,
    default: true
  },

  desde: {
    type: Date,
    default: Date.now
  },

  hasta: {
    type: Date
  },

  creadoPor: {
    type: String,
    ref: 'Usuario',
    required: true
  }
}, { timestamps: true });

// Índice compuesto para evitar duplicados
JugadorCompetenciaSchema.index(
  { jugadorEquipo: 1, equipoCompetencia: 1 },
  { unique: true }
);

export default mongoose.model('JugadorCompetencia', JugadorCompetenciaSchema);
