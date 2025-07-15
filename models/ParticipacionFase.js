import mongoose from 'mongoose';

const ParticipacionFaseSchema = new mongoose.Schema({
  equipoCompetencia: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EquipoCompetencia',
    required: true,
  },
  fase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
    required: true,
  },
  grupo: {
    type: String, // Solo si es fase tipo grupo
    default: null,
  },
  division: {
    type: String, // Solo si es fase tipo liga
    default: null,
  },
  puntos: { type: Number, default: 0 },
  partidosJugados: { type: Number, default: 0 },
  partidosGanados: { type: Number, default: 0 },
  partidosPerdidos: { type: Number, default: 0 },
  partidosEmpatados: { type: Number, default: 0 },
  diferenciaPuntos: { type: Number, default: 0 },
  clasificado: { type: Boolean, default: false },
  eliminado: { type: Boolean, default: false },
  seed: { type: Number, default: null },
  posicion: { type: Number, default: null },
}, { timestamps: true });

// Índice para evitar duplicados en fase + equipoCompetencia
ParticipacionFaseSchema.index({ fase: 1, equipoCompetencia: 1 }, { unique: true });

export default mongoose.model('ParticipacionFase', ParticipacionFaseSchema);
