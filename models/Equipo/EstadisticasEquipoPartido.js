import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const estadisticasEquipoPartidoSchema = new Schema({
  partido: { type: Schema.Types.ObjectId, ref: 'Partido', required: true },
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
  equipoPartido: { type: Schema.Types.ObjectId, ref: 'EquipoPartido' },

  throws: { type: Number, default: null },
  hits: { type: Number, default: null },
  outs: { type: Number, default: null },
  catches: { type: Number, default: null },

  calculado: { type: Boolean, default: false },
  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

estadisticasEquipoPartidoSchema.index({ partido: 1, equipo: 1 }, { unique: true });

export default model('EstadisticasEquipoPartido', estadisticasEquipoPartidoSchema);
