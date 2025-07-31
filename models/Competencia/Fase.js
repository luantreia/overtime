import mongoose from 'mongoose';

const FaseSchema = new mongoose.Schema({
  
  temporada: { type: mongoose.Schema.Types.ObjectId, ref: 'Temporada', required: true },

  nombre: { type: String, required: true, trim: true },
  tipo: { 
    type: String, 
    enum: ['grupo', 'liga', 'playoff', 'promocion', 'otro'], 
    default: 'otro',
    required: true 
  },
  orden: { type: Number, required: true, default: 0 },
  descripcion: String,

  fechaInicio: { type: Date },
  fechaFin: { type: Date },

  // Solo para tipo 'grupo'
  numeroClasificados: {
    type: Number,
    validate: {
      validator: function (val) {
        return this.tipo !== 'grupo' || (typeof val === 'number' && val >= 0);
      },
      message: 'numeroClasificados es obligatorio y debe ser >= 0 para fases tipo grupo.'
    }
  },


  // Para 'promocion' y 'playoff'
  faseOrigenA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
    validate: {
      validator: function (val) {
        return ['promocion', 'playoff'].includes(this.tipo) || !val;
      },
      message: 'faseOrigenA solo debe usarse en fases de promoción o playoff'
    }
  }, 

  faseOrigenB: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
    validate: {
      validator: function (val) {
        return ['promocion', 'playoff'].includes(this.tipo) || !val;
      },
      message: 'faseOrigenB solo debe usarse en fases de promoción o playoff'
    }
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
  ]
}, { timestamps: true });

export default mongoose.model('Fase', FaseSchema);