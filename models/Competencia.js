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
    default: '2025',
    trim: true,
  },
  
  tipo: {
    type: String,
    enum: ['liga', 'torneo', 'otro'],
    default: 'torneo',
    trim: true,
  },

  reglas: { type: String },

  fechaInicio: { type: Date, required: true },
  fechaFin: { type: Date },

  estado: {
    type: String,
    enum: ['programada', 'en_curso', 'finalizada', 'cancelada'],
    default: 'programada',
  },

  creadoPor: { 
    type: String, 
    ref: 'Usuario', 
    required: true,
  },

  administradores: [
    { type: String, ref: 'Usuario' }
  ],

}, { timestamps: true });

// Hook para generar nombre automáticamente
CompetenciaSchema.pre('validate', async function (next) {
  if (!this.nombre && this.tipo && this.modalidad && this.categoria && this.temporada && this.organizacion) {
    // Obtener nombre de la organización (si es un ObjectId, buscarla)
    let nombreOrg = '';
    if (typeof this.organizacion === 'object' && this.organizacion.nombre) {
      nombreOrg = this.organizacion.nombre;
    } else {
      const OrgModel = mongoose.model('Organizacion');
      const org = await OrgModel.findById(this.organizacion).lean();
      nombreOrg = org?.nombre || 'OrgDesconocida';
    }

    const capitalizar = str => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    const tipo = capitalizar(this.tipo);
    const modalidad = capitalizar(this.modalidad);
    const categoria = capitalizar(this.categoria);

    this.nombre = `${tipo} ${modalidad} ${categoria} ${this.temporada} - ${nombreOrg}`;
  }
  next();
});

export default mongoose.model('Competencia', CompetenciaSchema);
