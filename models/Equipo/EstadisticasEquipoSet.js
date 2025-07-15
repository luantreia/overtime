import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const estadisticasEquipoSetSchema = new Schema({
  setPartido: { type: Schema.Types.ObjectId, ref: 'SetPartido', required: true },
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
  equipoPartido: { type: Schema.Types.ObjectId, ref: 'EquipoPartido' },

  throws: { type: Number, default: null },
  hits: { type: Number, default: null },
  outs: { type: Number, default: null },
  catches: { type: Number, default: null },

  calculado: { type: Boolean, default: false },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

estadisticasEquipoSetSchema.index({ setPartido: 1, equipo: 1 }, { unique: true });

export default model('EstadisticasEquipoSet', estadisticasEquipoSetSchema);
