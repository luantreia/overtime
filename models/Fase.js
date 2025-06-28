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
    enum: ['grupo', 'liga', 'playoff', 'otro'], 
    required: true 
  },
  orden: { type: Number, required: true, default: 0 },
  descripcion: String,

  // Solo para tipo 'grupo'
  numeroClasificados: {
    type: Number,
    validate: {
      validator: function (val) {
        return this.tipo !== 'grupo' || (val !== null && val !== undefined);
      },
      message: 'numeroClasificados es obligatorio para fases tipo grupo.'
    }
  },

  // Solo para tipo 'liga'
  division: {
    type: String,
    enum: ['A', 'B', 'C'],
    default: undefined,
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
    validate: {
      validator: function (val) {
        return this.tipo !== 'liga' || true; // opcional en liga, no obligatorio
      }
    }
  },
  inferiorDirecta: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
    validate: {
      validator: function (val) {
        return this.tipo !== 'liga' || true;
      }
    }
  },
  numeroAscensos: {
    type: Number,
    validate: {
      validator: function (val) {
        return this.tipo !== 'liga' || val !== null;
      },
      message: 'numeroAscensos es obligatorio para fases tipo liga.'
    }
  },
  numeroDescensos: {
    type: Number,
    validate: {
      validator: function (val) {
        return this.tipo !== 'liga' || val !== null;
      },
      message: 'numeroDescensos es obligatorio para fases tipo liga.'
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
