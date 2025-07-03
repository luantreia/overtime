// models/ParticipacionFase.js
import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const ParticipacionFaseSchema = new Schema({
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
  },
  division: {
    type: String, // Solo si es fase tipo liga
  },

  puntos: { type: Number, default: 0 },
  partidosJugados: { type: Number, default: 0 },
  partidosGanados: { type: Number, default: 0 },
  partidosPerdidos: { type: Number, default: 0 },
  partidosEmpatados: { type: Number, default: 0 },
  diferenciaPuntos: { type: Number, default: 0 },

  clasificado: { type: Boolean, default: false },
  eliminado: { type: Boolean, default: false },
  seed: { type: Number }, // Para sorteos o llaves

  posicion: { type: Number }, // Para tabla ordenada
}, { timestamps: true });

export default mongoose.model('ParticipacionFase', ParticipacionFaseSchema);
