import mongoose from 'mongoose';

const CompetenciaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String },

  organizacion: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organizacion', 
    required: true 
  },

  modalidad: { 
    type: String, 
    enum: ['Foam', 'Cloth'], 
    required: true,
    trim: true,
  },

  categoria: { 
    type: String, 
    enum: ['Masculino', 'Femenino', 'Mixto', 'Libre'], 
    required: true,
    trim: true,
  },
  
  temporada: { 
    type: String, 
    default: '2025',  // o lo que prefieras
    trim: true,
  },
  
  tipo: {
    type: String,
    enum: ['liga', 'torneo', 'otro'],
    default: 'torneo',
    trim: true,
  },

  reglas: { type: String }, // campo para reglas específicas, link o JSON si querés

  fechaInicio: { type: Date, required: true },
  fechaFin: { type: Date },

  estado: {
    type: String,
    enum: ['programada', 'en_curso', 'finalizada', 'cancelada'],
    default: 'programada',
  },

  creadoPor: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Usuario', 
    required: true,
  },

  administradores: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
  ],

}, { timestamps: true });

export default mongoose.model('Competencia', CompetenciaSchema);
