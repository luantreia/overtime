import mongoose from 'mongoose';

const MatchPlayerSchema = new mongoose.Schema({
  partidoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partido', required: true, index: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador', required: true },
  teamColor: { type: String, enum: ['rojo', 'azul'] },
  preRating: { type: Number },
  postRating: { type: Number },
  delta: { type: Number },
  win: { type: Boolean },
  isAFK: { type: Boolean, default: false },
  competenciaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competencia' },
  temporadaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Temporada' },
  modalidad: { type: String },
  categoria: { type: String }
}, { timestamps: true });

// Compound index for uniqueness per match/player/season/competition context
MatchPlayerSchema.index({ partidoId: 1, playerId: 1, temporadaId: 1, competenciaId: 1 }, { unique: true });

export default mongoose.model('MatchPlayer', MatchPlayerSchema);
