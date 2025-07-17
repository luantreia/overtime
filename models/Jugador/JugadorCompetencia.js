import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** JugadorCompetencia **/
const jugadorCompetenciaSchema = new Schema({

  jugadorEquipo: { type: Schema.Types.ObjectId, ref: 'JugadorEquipo', required: true },
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true, index: true },
  equipoCompetencia: { type: Schema.Types.ObjectId, ref: 'EquipoCompetencia', required: true },

  activo: { type: Boolean, default: true },
  estado: {
    type: String,
    enum: ['activo', 'baja', 'suspendido'],
    default: ['aceptado'],
    index: true,
  },
  rol: { type: String, enum: ['jugador', 'entrenador'], default: 'jugador' },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

jugadorCompetenciaSchema.index({ jugadorEquipo: 1, equipoCompetencia: 1 }, { unique: true });

jugadorCompetenciaSchema.pre('save', async function(next) {
  if (!this.jugador && this.isModified('jugadorEquipo')) {
    const je = await model('JugadorEquipo').findById(this.jugadorEquipo).select('jugador');
    if (je) this.jugador = je.jugador;
  }
  next();
});

export default model('JugadorCompetencia', jugadorCompetenciaSchema);
