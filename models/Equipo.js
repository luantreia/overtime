import mongoose from 'mongoose';

const equipoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  escudo: { type: String },
  foto: { type: String },
  administradores: { type: [String], required: true }, // Array de UIDs Firebase
}, { timestamps: true });

export default mongoose.model('Equipo', equipoSchema);
