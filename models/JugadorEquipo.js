// models/JugadorEquipo.js

import mongoose from 'mongoose';

const jugadorEquipoSchema = new mongoose.Schema({
  jugador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Jugador',
    required: true,
  },
  equipo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true,
  },
  desde: Date,
  hasta: Date,

  activo: {
    type: Boolean,
    default: true,
  },

  estado: { 
    type: String, enum: ['pendiente', 'aceptado'],
    default: 'aceptado' 
  },

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

jugadorEquipoSchema.index({ jugador: 1, equipo: 1}, { unique: true });

// Virtual: nombreJugadorEquipo
jugadorEquipoSchema.virtual('nombreJugadorEquipo').get(function () {
  if (this.populated('jugador') && this.populated('equipo')) {
    return `${this.jugador.nombre} - ${this.equipo.nombre}`;
  }
  return undefined;
});

jugadorEquipoSchema.set('toObject', { virtuals: true });
jugadorEquipoSchema.set('toJSON', { virtuals: true });


export default mongoose.model('JugadorEquipo', jugadorEquipoSchema);
