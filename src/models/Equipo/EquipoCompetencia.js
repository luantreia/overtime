import mongoose from 'mongoose';
const { Schema, model } = mongoose;
import Equipo from './Equipo.js';
import Competencia from '../Competencia/Competencia.js';

const equipoCompetenciaSchema = new Schema({
  nombre: { type: String, trim: true },
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
  competencia: { type: Schema.Types.ObjectId, ref: 'Competencia', required: true },

  estado: {
    type: String,
    enum: ['suspendido', 'aceptado', 'baja'],
    default: 'aceptado',
    index: true,
  },

  solicitadoPor: { type: String, ref: 'Usuario' },


  activo: { type: Boolean, default: true },

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],

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
equipoCompetenciaSchema.index({ equipo: 1, competencia: 1 }, { unique: true });

export default model('EquipoCompetencia', equipoCompetenciaSchema);
