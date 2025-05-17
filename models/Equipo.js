import mongoose from 'mongoose';

const equipoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
});

export default mongoose.model('Equipo', equipoSchema);
