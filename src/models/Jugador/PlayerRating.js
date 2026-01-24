import mongoose from 'mongoose';

const PlayerRatingSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador', required: true, index: true },
  competenciaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competencia', index: true },
  temporadaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Temporada', index: true },
  modalidad: { type: String }, // 'Foam' | 'Cloth'
  categoria: { type: String }, // 'Masculino' | 'Femenino' | 'Mixto' | 'Libre'
  rating: { type: Number, default: 1500 },
  matchesPlayed: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  lastDelta: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
  meta: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

PlayerRatingSchema.index({ playerId: 1, competenciaId: 1, temporadaId: 1, modalidad: 1, categoria: 1 }, { unique: true, sparse: true });

export default mongoose.model('PlayerRating', PlayerRatingSchema);
