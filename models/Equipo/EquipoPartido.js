import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const equipoPartidoSchema = new Schema({
  partido: { type: Schema.Types.ObjectId, ref: 'Partido', required: true },
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },

  equipoCompetencia: { type: Schema.Types.ObjectId, ref: 'EquipoCompetencia' },
  participacionTemporada: { type: Schema.Types.ObjectId, ref: 'ParticipacionTemporada' },
  participacionFase: { type: Schema.Types.ObjectId, ref: 'ParticipacionFase' },

  esLocal: { type: Boolean, required: true },
  sePresento: { type: Boolean, default: true },
  descalificado: { type: Boolean, default: false },

  puntosObtenidos: { type: Number, default: 0 },
  resultado: {
    type: String,
    enum: ['ganado', 'perdido', 'empate', 'pendiente'],
    default: 'pendiente',
  },
  observaciones: String,

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

equipoPartidoSchema.index({ partido: 1, equipo: 1 }, { unique: true });

export default model('EquipoPartido', equipoPartidoSchema);
