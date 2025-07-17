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
