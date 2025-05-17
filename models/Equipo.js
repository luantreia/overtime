import mongoose from 'mongoose';

const equipoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  escudo: { type: String },
  foto: { type: String},
  creadoPor: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('Equipo', equipoSchema);
