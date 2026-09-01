import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const equipoSchema = new Schema({
  nombre: { type: String, required: true },
  escudo: { type: String },
  foto: { type: String },
  colores: { type: [String], default: [] }, // Ej: ['#75AADB', '#FFFFFF']

  fechaFormacion: { type: Date },
  fechaDisolucion: { type: Date },

  tipo: {
    type: String,
    enum: ['club', 'seleccion', 'academia', 'otro'],
    default: 'club',
  },
  esSeleccionNacional: { type: Boolean, default: false },
  pais: { type: String, default: '' }, // ISO: "ARG", "BRA", etc.
  federacion: { type: Schema.Types.ObjectId, ref: 'Federacion' },

  descripcion: { type: String, default: '' },
  sitioWeb: { type: String, default: '' },

  redesSociales: {
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' },
    twitter: { type: String, default: '' },
    tiktok: { type: String, default: '' },
    youtube: { type: String, default: '' },
  },

  // Verificacion: un equipo creado por un DT desde su propio panel nace sin verificar.
  // Puede operar (plantilla, amistosos, estadisticas) pero no inscribirse a
  // competencias hasta que un Super Admin lo valide.
  verificado: { type: Boolean, default: false, index: true },
  verificadoPor: { type: String, ref: 'Usuario', default: null },
  verificadoEn: { type: Date, default: null },

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],
}, { timestamps: true });

export default model('Equipo', equipoSchema);
