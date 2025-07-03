import mongoose from 'mongoose';

const equipoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  escudo: { type: String },
  foto: { type: String },

  colores: [String], // Ej: ['#75AADB', '#FFFFFF']
  
  // 🔀 CLAVE: tipo de equipo
  tipo: {
    type: String,
    enum: ['club', 'seleccion', 'academia', 'otro'],
    default: 'club',
  },

  // 🌍 Si es una selección
  esSeleccionNacional: { type: Boolean, default: false },
  pais: { type: String }, // ISO code: "ARG", "BRA", etc.

  // 🧑‍💼 Relación opcional con federación u organización
  federacion: { type: mongoose.Schema.Types.ObjectId, ref: 'Federacion' },

  // 🧾 Info adicional
  descripcion: { type: String },
  
  sitioWeb: { type: String },

  creadoPor: { 
    type: String,
    ref: 'Usuario', // o 'Usuario', como tengas tu modelo de usuario
    required: true,
  },
  administradores: [
    {
      type: String,
      ref: 'Usuario',
    }
  ],
}, { timestamps: true });

export default mongoose.model('Equipo', equipoSchema);
