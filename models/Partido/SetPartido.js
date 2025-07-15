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

  estadisticasJugadores: [
    {
      jugadorPartido: { type: mongoose.Schema.Types.ObjectId, ref: 'JugadorPartido', required: true },
      jugador: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador', required: true },
      equipo: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },

      throws: { type: Number, default: 0 },
      hits: { type: Number, default: 0 },
      outs: { type: Number, default: 0 },
      catches: { type: Number, default: 0 },
    }
  ],

  creadoPor: {
    type: String,
    ref: 'Usuario',
    required: true,
  }

}, { timestamps: true });

SetPartidoSchema.index({ partido: 1, numeroSet: 1 }, { unique: true });

export default mongoose.model('SetPartido', SetPartidoSchema);
