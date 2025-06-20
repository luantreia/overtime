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

  modalidad: {
    type: String,
    enum: ['cloth', 'foam'],
  },

  liga: {
    type: String,

  },

  categoria: {
    type: String,
    enum: ['masculino', 'femenino', 'mixto', 'libre'],
  },

  rol: {
    type: String,
    enum: ['jugador', 'capitan', 'entrenador'],
    default: 'jugador',
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

jugadorEquipoSchema.index({ jugador: 1, equipo: 1, modalidad: 1, liga: 1, categoria: 1 }, { unique: false });

export default mongoose.model('JugadorEquipo', jugadorEquipoSchema);
