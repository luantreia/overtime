// models/Jugador.js

import mongoose from 'mongoose';

const jugadorSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  posicion: { type: [String], default: [] },
  equipoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo' },
  edad: { type: Number },
  foto: { type: String },
}, { timestamps: true });

export default mongoose.model('Jugador', jugadorSchema);

