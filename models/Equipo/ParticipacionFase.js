import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const participacionFaseSchema = new Schema({
  participacionTemporada: { type: Schema.Types.ObjectId, ref: 'ParticipacionTemporada', required: true },
  fase: { type: Schema.Types.ObjectId, ref: 'Fase', required: true },
  equipoCompetencia: { type: Schema.Types.ObjectId, ref: 'EquipoCompetencia', required: true },
  
  grupo: { type: String, default: null },
  division: { type: String, default: null },

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

participacionFaseSchema.index({ fase: 1, equipoCompetencia: 1 }, { unique: true });

export default model('ParticipacionFase', participacionFaseSchema);
