import mongoose from 'mongoose';

const FaseSchema = new mongoose.Schema({
  competencia: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Competencia', 
    required: true 
  },
  nombre: { type: String, required: true, trim: true },
  tipo: { 
    type: String, 
    enum: ['grupo', 'liga', 'playoff', 'promocion', 'otro'], 
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

  // Solo para tipo 'liga'
  division: {
    type: String,
    enum: ['A', 'B', 'C'],
    default: null,
    validate: {
      validator: function (val) {
        return this.tipo !== 'liga' || !!val;
      },
      message: 'division es obligatoria para fases tipo liga.'
    }
  },
  superiorDirecta: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
  },
  inferiorDirecta: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
  },
  numeroAscensos: {
    type: Number,
    validate: {
      validator: function (val) {
        return this.tipo !== 'liga' || (typeof val === 'number' && val >= 0);
      },
      message: 'numeroAscensos es obligatorio y debe ser >= 0 para fases tipo liga.'
    }
  },
  numeroDescensos: {
    type: Number,
    validate: {
      validator: function (val) {
        return this.tipo !== 'liga' || (typeof val === 'number' && val >= 0);
      },
      message: 'numeroDescensos es obligatorio y debe ser >= 0 para fases tipo liga.'
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