import mongoose from 'mongoose';

const equipoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  escudo: { type: String },
  foto: { type: String },
  creadoPor: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // o 'Usuario', como tengas tu modelo de usuario
    required: true,
  },
  administradores: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }
  ],
}, { timestamps: true });

export default mongoose.model('Equipo', equipoSchema);
