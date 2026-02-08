import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const KarmaLogSchema = new Schema({
  targetPlayer: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true },
  fromUser: { type: String, ref: 'Usuario', required: true }, // Quien califica
  lobbyId: { type: Schema.Types.ObjectId, ref: 'Lobby', required: true },
  
  type: {
    type: String,
    enum: ['positive', 'negative', 'no-show', 'fair-play', 'mvp'],
    required: true
  },
  
  points: { 
    type: Number, 
    required: true 
  }, // e.g., +5 por fair-play, -20 por no-show
  
  comment: { type: String, trim: true },
  
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// Índice para evitar duplicados de la misma persona en el mismo lobby para el mismo jugador
KarmaLogSchema.index({ fromUser: 1, lobbyId: 1, targetPlayer: 1 }, { unique: true });

const KarmaLog = mongoose.model('KarmaLog', KarmaLogSchema);
export default KarmaLog;
