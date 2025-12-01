import mongoose from 'mongoose';

const MatchPlayerSchema = new mongoose.Schema({
  partidoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partido', required: true, index: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador', required: true },
  teamColor: { type: String, enum: ['rojo', 'azul'], required: true },
  preRating: { type: Number, required: true },
  postRating: { type: Number, required: true },
  delta: { type: Number, required: true },
  competenciaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competencia' },
  temporadaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Temporada' },
  modalidad: { type: String },
  categoria: { type: String }
}, { timestamps: true });

MatchPlayerSchema.index({ partidoId: 1, playerId: 1 }, { unique: true });

export default mongoose.model('MatchPlayer', MatchPlayerSchema);
