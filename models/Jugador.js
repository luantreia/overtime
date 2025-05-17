const mongoose = require('mongoose');

const jugadorSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  posicion: { type: [String], default: [] }, // array de posiciones (ej: ["ofensiva", "defensiva"])
  equipoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo' }, // referencia a otro modelo si querés
  edad: { type: Number },
  foto: { type: String },
});

const Jugador = mongoose.model('Jugador', jugadorSchema);
module.exports = Jugador;