import mongoose from 'mongoose';
const { Schema, model } = mongoose;
import Equipo from './Equipo.js';
import Competencia from '../Competencia/Competencia.js';

const equipoCompetenciaSchema = new Schema({
  nombre: { type: String, trim: true },

  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
  competencia: { type: Schema.Types.ObjectId, ref: 'Competencia', required: true },

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],

  estado: {
    type: String,
    enum: ['pendiente', 'aceptado'],
    default: 'pendiente',
    index: true,
  },
  solicitadoPor: { type: String, ref: 'Usuario' },
  origen: { type: String, enum: ['equipo', 'competencia'], required: true },

  fechaSolicitud: { type: Date, default: Date.now },
  fechaAceptacion: Date,
  motivoRechazo: String,

  activo: { type: Boolean, default: false },
}, { timestamps: true });

equipoCompetenciaSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('nombre') && (!this.nombre || this.nombre.trim() === '')) {
      const equipo = await Equipo.findById(this.equipo).select('nombre');
      const competencia = await Competencia.findById(this.competencia).select('nombre');
      if (equipo && competencia) {
        this.nombre = `${equipo.nombre} - ${competencia.nombre}`;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

export default model('EquipoCompetencia', equipoCompetenciaSchema);
