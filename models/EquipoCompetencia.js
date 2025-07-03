import mongoose from 'mongoose';
import Equipo from './Equipo.js';
import Competencia from './Competencia.js';

const EquipoCompetenciaSchema = new mongoose.Schema({
  equipo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true
  },

  nombre: {
    type: String,
    trim: true
  },

  competencia: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competencia',
    required: true
  },

  fase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
  },

  jugadoresCompetencia: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JugadorCompetencia'
  }],

  grupo: {
    type: String, // Ej: 'A', 'B', 'C', etc.
    trim: true
  },

  division: {
    type: String,
    trim: true,
  },

  seed: {
    type: Number, // Posición o "ranking inicial" para sorteos
    default: null
  },

  puntos: {
    type: Number,
    default: 0
  },

  partidosJugados: {
    type: Number,
    default: 0
  },

  partidosGanados: {
    type: Number,
    default: 0
  },

  partidosEmpatados: {
    type: Number,
    default: 0
  },

  partidosPerdidos: {
    type: Number,
    default: 0
  },

  diferenciaPuntos: {
    type: Number,
    default: 0 // Para orden en tabla de posiciones
  },

  posicion: {
    type: Number,
    default: null // Posición en la tabla (opcional, se puede calcular)
  },

  activo: {
    type: Boolean,
    default: true
  },

  eliminado: {
    type: Boolean,
    default: false
  },

  clasificado: {
    type: Boolean,
    default: false
  },

  creadoPor: {
    type: String,
    ref: 'Usuario',
    required: true
  },

  administradores: [{
    type: String,
    ref: 'Usuario'
  }]
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
