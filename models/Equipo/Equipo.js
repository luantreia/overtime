import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const equipoSchema = new Schema({
  nombre: { type: String, required: true },
  escudo: { type: String },
  foto: { type: String },
  colores: { type: [String], default: [] }, // Ej: ['#75AADB', '#FFFFFF']

  tipo: {
    type: String,
    enum: ['club', 'seleccion', 'academia', 'otro'],
    default: 'club',
  },
  esSeleccionNacional: { type: Boolean, default: false },
  pais: { type: String, default: '' }, // ISO: "ARG", "BRA", etc.
  federacion: { type: Schema.Types.ObjectId, ref: 'Federacion' },

  descripcion: { type: String, default: '' },
  sitioWeb: { type: String, default: '' },

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],
}, { timestamps: true });

export default model('Equipo', equipoSchema);
