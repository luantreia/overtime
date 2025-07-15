import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** JugadorFase **/
const jugadorFaseSchema = new Schema({
  jugadorTemporada: { type: Schema.Types.ObjectId, ref: 'JugadorTemporada', required: true },
  participacionFase: { type: Schema.Types.ObjectId, ref: 'ParticipacionFase', required: true },
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true },

  estado: { type: String, enum: ['activo', 'baja'], default: 'activo' },
  numero: Number,
  rol: { type: String, enum: ['jugador', 'capitan', 'entrenador'], default: 'jugador' },
  desde: Date,
  hasta: Date,

  creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
}, { timestamps: true });

jugadorFaseSchema.index({ jugadorTemporada: 1, participacionFase: 1 }, { unique: true });

export default model('JugadorFase', jugadorFaseSchema);

