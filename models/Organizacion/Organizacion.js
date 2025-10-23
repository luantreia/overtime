// models/Organizacion.js

import mongoose from 'mongoose';

const organizacionSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String },
  logo: { type: String }, // URL o path al archivo
  sitioWeb: { type: String },

  creadoPor: {
    type: String,
    ref: 'Usuario',
    required: true
  },

  administradores: [
    {
      type: String,
      ref: 'Usuario',
    }
  ],

  activa: { type: Boolean, default: true },
}, {
  timestamps: true
});

export default mongoose.model('Organizacion', organizacionSchema);
