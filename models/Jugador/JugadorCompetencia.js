import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** JugadorCompetencia **/
const jugadorCompetenciaSchema = new Schema({

  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true, index: true },
  competencia: { type: Schema.Types.ObjectId, ref: 'Competencia', required: true },

  activo: { type: Boolean, default: true },
  estado: {
    type: String,
    enum: ['aceptado', 'suspendido'],
    default: 'aceptado',
    index: true,
  },

  creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
}, { timestamps: true });

jugadorCompetenciaSchema.index({ jugador: 1, competencia: 1 }, { unique: true });

jugadorCompetenciaSchema.pre('save', async function(next) {
  if (!this.jugador && this.isModified('jugadorEquipo')) {
    const je = await model('JugadorEquipo').findById(this.jugadorEquipo).select('jugador');
    if (je) this.jugador = je.jugador;
  }
  next();
});

export default model('JugadorCompetencia', jugadorCompetenciaSchema);
