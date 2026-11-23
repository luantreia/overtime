import mongoose from 'mongoose';
import { tiempoPartidoSchema } from '../Partido/tiempoVideo.js';
const { Schema, model } = mongoose;

/**
 * PlanillaSet - Un set según la planilla del equipo.
 *
 * Igual que PlanillaPresente, `setPartido` enlaza con el set oficial cuando existe.
 * Al oficializar, un set que ya existe se referencia pero NO se sobreescribe: el
 * `ganadorSet` del registro oficial sigue siendo del organizador, aunque la planilla
 * del equipo diga otra cosa.
 */
const planillaSetSchema = new Schema({
  planilla: { type: Schema.Types.ObjectId, ref: 'PlanillaEquipo', required: true, index: true },

  numeroSet: { type: Number, required: true },

  ganadorSet: {
    type: String,
    enum: ['local', 'visitante', 'empate', 'pendiente'],
    default: 'pendiente',
  },

  setPartido: { type: Schema.Types.ObjectId, ref: 'SetPartido', default: null },

  // Dónde está el set en el video según esta planilla, en segundos de partido. Puede no
  // coincidir con el oficial: cada fuente marca sus propios tiempos.
  tiempo: { type: tiempoPartidoSchema, default: null },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

planillaSetSchema.index({ planilla: 1, numeroSet: 1 }, { unique: true });

export default model('PlanillaSet', planillaSetSchema);
