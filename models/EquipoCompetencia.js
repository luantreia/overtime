// models/EquipoCompetencia.js
import mongoose from 'mongoose';
import Equipo from './Equipo.js';
import Competencia from './Competencia.js';

const Schema = mongoose.Schema;

const EquipoCompetenciaSchema = new Schema({
  
  nombre: {
    type: String,
    trim: true
  },
  equipo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true,
  },
  competencia: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competencia',
    required: true,
  },
  jugadores: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Jugador',
  }],
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
}, { timestamps: true });

// Middleware para generar el nombre antes de guardar
EquipoCompetenciaSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('nombre') && (!this.nombre || this.nombre.trim() === '')) {
      const equipo = await Equipo.findById(this.equipo).select('nombre');
      const competencia = await Competencia.findById(this.competencia).select('nombre');
      if (equipo && competencia) {
        this.nombre = `${equipo.nombre} - ${competencia.nombre}`;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model('EquipoCompetencia', EquipoCompetenciaSchema);
