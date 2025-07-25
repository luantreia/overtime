import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** JugadorTemporada **/
const jugadorTemporadaSchema = new Schema({
  jugadorEquipo: { type: Schema.Types.ObjectId, ref: 'JugadorEquipo', required: true },
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true, index: true },
  participacionTemporada: { type: Schema.Types.ObjectId, ref: 'ParticipacionTemporada', required: true },

  desde: { type: Date, default: Date.now },
  hasta: Date,

  estado: { type: String, 
    enum: ['aceptado', 'baja', 'suspendido' ], 
    default: 'aceptado' },

  rol: { type: String, enum: ['jugador', 'entrenador'], default: 'jugador' },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

jugadorTemporadaSchema.index({ jugadorEquipo: 1, participacionTemporada: 1 }, { unique: true });

jugadorTemporadaSchema.pre('save', async function(next) {
  if (!this.jugador && this.isModified('jugadorEquipo')) {
    const jc = await model('JugadorEquipo').findById(this.jugadorEquipo).select('jugador');
    if (jc) this.jugador = jc.jugador;
  }
  next();
});

export default model('JugadorTemporada', jugadorTemporadaSchema);
