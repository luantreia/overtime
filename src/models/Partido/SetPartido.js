import mongoose from 'mongoose';

const SetPartidoSchema = new mongoose.Schema({
  partido: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partido',
    required: true,
    index: true,
  },

  numeroSet: {
    type: Number,
    required: true,
  },

  ganadorSet: {
    type: String,
    enum: ['local', 'visitante', 'empate', 'pendiente'],
    default: 'pendiente',
  },

  estadoSet: {
    type: String,
    enum: ['en_juego', 'finalizado'],
    default: 'en_juego',
  },

  // Timer State Persistence
  timerSetValue: { type: Number, default: 180 },
  timerSetRunning: { type: Boolean, default: false },
  timerSetLastUpdate: { type: Date, default: Date.now },
  
  timerSuddenDeathValue: { type: Number, default: 0 },
  timerSuddenDeathRunning: { type: Boolean, default: false },
  suddenDeathMode: { type: Boolean, default: false },

  // Duration Statistics
  iniciadoEn: { type: Date, default: null },        // When set timer started
  finalizadoEn: { type: Date, default: null },      // When set was finished (winner selected)
  duracionReal: { type: Number, default: null },    // Actual duration in seconds (finalizadoEn - iniciadoEn)
  duracionSetTimer: { type: Number, default: null }, // How much of the 3:00 was used (180 - timerSetValue at finish)
  duracionSuddenDeath: { type: Number, default: null }, // Sudden death duration if applicable

  meta: { type: mongoose.Schema.Types.Mixed },

  creadoPor: {
    type: String,
    ref: 'Usuario',
    required: true,
  }

}, { timestamps: true });

SetPartidoSchema.pre('validate', function (next) {
  if (this.ganadorSet && this.ganadorSet !== 'pendiente') {
    this.estadoSet = 'finalizado';
  }
  next();
});

SetPartidoSchema.index({ partido: 1, numeroSet: 1 }, { unique: true });

export default mongoose.model('SetPartido', SetPartidoSchema);
