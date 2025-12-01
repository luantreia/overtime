import mongoose from 'mongoose';

const MatchTeamSchema = new mongoose.Schema({
  partidoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partido', required: true, index: true },
  color: { type: String, enum: ['rojo', 'azul'], required: true },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Jugador' }],
  averagePreRating: { type: Number }
}, { timestamps: true });

MatchTeamSchema.index({ partidoId: 1, color: 1 }, { unique: true });

export default mongoose.model('MatchTeam', MatchTeamSchema);
