import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * PlanillaEstadistica - Los números de un jugador en la planilla del equipo.
 *
 * Con `planillaSet` cargado es una fila set a set (modo 'sets'); con `planillaSet`
 * en null son los totales del partido (modo 'directa'). Mismos cuatro contadores que
 * las colecciones oficiales, para que la oficialización sea una copia directa.
 */
const planillaEstadisticaSchema = new Schema({
  planilla: { type: Schema.Types.ObjectId, ref: 'PlanillaEquipo', required: true, index: true },
  planillaSet: { type: Schema.Types.ObjectId, ref: 'PlanillaSet', default: null },
  planillaPresente: { type: Schema.Types.ObjectId, ref: 'PlanillaPresente', required: true },

  throws: { type: Number, default: 0, min: 0 },
  hits: { type: Number, default: 0, min: 0 },
  outs: { type: Number, default: 0, min: 0 },
  catches: { type: Number, default: 0, min: 0 },
  survive: { type: Boolean, default: false },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

// En modo 'directa' planillaSet es null, y Mongo trata null como un valor más: el
// índice sigue garantizando una sola fila de totales por jugador.
planillaEstadisticaSchema.index({ planillaSet: 1, planillaPresente: 1 }, { unique: true });

export default model('PlanillaEstadistica', planillaEstadisticaSchema);
