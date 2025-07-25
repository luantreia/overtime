import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** JugadorPartido **/
const jugadorPartidoSchema = new Schema({
  partido: { type: Schema.Types.ObjectId, ref: 'Partido', required: true },
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true },

  jugadorEquipo: { type: Schema.Types.ObjectId, ref: 'JugadorEquipo' },
  jugadorCompetencia: { type: Schema.Types.ObjectId, ref: 'JugadorCompetencia' },
  jugadorTemporada: { type: Schema.Types.ObjectId, ref: 'JugadorTemporada' },
  jugadorFase: { type: Schema.Types.ObjectId, ref: 'JugadorFase' },

  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
  equipoPartido: { type: Schema.Types.ObjectId, ref: 'EquipoPartido' },
  
  estado: { type: String, 
    enum: ['aceptado', 'baja', 'suspendido' ], 
    default: 'aceptado' },

  rol: { type: String, enum: ['jugador', 'entrenador'], default: 'jugador' },
  numero: { type: Number, min: 0, max: 99 },

  creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
}, { timestamps: true });

jugadorPartidoSchema.index({ partido: 1, jugador: 1 }, { unique: true });

export default model('JugadorPartido', jugadorPartidoSchema);

