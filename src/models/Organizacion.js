// models/Organizacion.js

import mongoose from 'mongoose';

const organizacionSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String },
  logo: { type: String }, // URL o path al archivo
  sitioWeb: { type: String },

  // URL de un video de YouTube que Public usa como fondo del header de la organización.
  // Se guarda la URL tal cual la pega el organizador (watch?v=, youtu.be, /shorts/, /embed/):
  // el ID se extrae en el frontend, así no perdemos el link original si mañana lo queremos
  // mostrar como enlace.
  videoFondoUrl: { type: String, default: '' },

  redesSociales: {
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' },
    twitter: { type: String, default: '' },
    tiktok: { type: String, default: '' },
    youtube: { type: String, default: '' },
  },

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

  // Flag to allow data to count towards Global Master Ranking
  verificada: { type: Boolean, default: false },

  activa: { type: Boolean, default: true },

  // Nuevos campos para gestión de miembros
  miembrosPublicos: { type: Boolean, default: true }, // Si los miembros son visibles públicamente
  requiereInvitacion: { type: Boolean, default: false }, // Si se requiere invitación para unirse
}, {
  timestamps: true
});

// Índices para mejor rendimiento
organizacionSchema.index({ creadoPor: 1 });
organizacionSchema.index({ administradores: 1 });
organizacionSchema.index({ activa: 1, verificada: 1 });

export default mongoose.model('Organizacion', organizacionSchema);
