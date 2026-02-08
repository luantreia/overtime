import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const LobbySchema = new Schema({
  host: { type: String, ref: 'Usuario', required: true }, // UID de Firebase
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  
  modalidad: {
    type: String,
    enum: ['Foam', 'Cloth'],
    required: true
  },
  categoria: {
    type: String,
    enum: ['Masculino', 'Femenino', 'Mixto', 'Libre'],
    default: 'Libre'
  },

  location: {
    name: { type: String, required: true },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    address: { type: String }
  },

  scheduledDate: { type: Date, required: true },
  maxPlayers: { type: Number, default: 12 },
  
  status: {
    type: String,
    enum: ['open', 'full', 'playing', 'finished', 'cancelled'],
    default: 'open'
  },

  players: [{
    player: { type: Schema.Types.ObjectId, ref: 'Jugador' },
    userUid: { type: String }, // Para linkear con el usuario que se unió
    team: { type: String, enum: ['A', 'B', 'none'], default: 'none' },
    joinedAt: { type: Date, default: Date.now },
    confirmed: { type: Boolean, default: false } // Check-in en el lugar
  }],

  // Resultados (para el doble-check)
  result: {
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
    submittedBy: { type: String }, // UID
    confirmedByOpponent: { type: Boolean, default: false },
    disputed: { type: Boolean, default: false }
  },

  matchId: { type: Schema.Types.ObjectId, ref: 'Partido' }, // Link al partido oficial una vez finalizado

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Middleware para actualizar status si llega al máx
LobbySchema.pre('save', function(next) {
  if (this.players.length >= this.maxPlayers && this.status === 'open') {
    this.status = 'full';
  } else if (this.players.length < this.maxPlayers && this.status === 'full') {
    this.status = 'open';
  }
  next();
});

const Lobby = mongoose.model('Lobby', LobbySchema);
export default Lobby;
