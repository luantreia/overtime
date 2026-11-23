import mongoose from 'mongoose';
import { ORIGENES_TIEMPO } from './tiempoVideo.js';
const { Schema, model } = mongoose;

/**
 * EventoSet — una marca dentro de un set: quién sale, por qué, quién lo sacó, quién vuelve.
 * Misma forma que las marcas de "supervivencia" del panel de análisis (realtime-cv-platform).
 *
 * Con la alineación del set y estas marcas se reconstruye quién está en cancha en cada
 * instante (la línea de "vivos") y salen las estadísticas: outs por motivo, hits y catches
 * hechos (`por`), reingresos y quién sobrevivió (ver utils/supervivencia.js).
 *
 * Cuelga de un set oficial (`setPartido`) o del set de una planilla (`planillaSet`), nunca de
 * los dos: cada fuente tiene sus propias marcas, como tiene sus propios ganadores.
 *
 *   out        `jugador` sale (motivo hit|catch|linea|otro; `por` = el rival que tiró o atajó)
 *   reingreso  `jugador` vuelve (tras un catch de su equipo)
 *   cambio     `jugador` sale sin out (lesión) y entra `entra`
 */
export const TIPOS_EVENTO = ['out', 'reingreso', 'cambio'];
export const MOTIVOS_OUT = ['hit', 'catch', 'linea', 'otro'];

const eventoSetSchema = new Schema(
  {
    partido: { type: Schema.Types.ObjectId, ref: 'Partido', required: true, index: true },
    setPartido: { type: Schema.Types.ObjectId, ref: 'SetPartido', default: null, index: true },
    planillaSet: { type: Schema.Types.ObjectId, ref: 'PlanillaSet', default: null, index: true },

    /** Segundo de partido (ver tiempoVideo.js). Sin video, segundos desde el inicio del set. */
    t: { type: Number, required: true, min: 0 },
    tipo: { type: String, enum: TIPOS_EVENTO, required: true },

    jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true },
    equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },

    motivo: { type: String, enum: [...MOTIVOS_OUT, null], default: null },
    por: { type: Schema.Types.ObjectId, ref: 'Jugador', default: null },
    entra: { type: Schema.Types.ObjectId, ref: 'Jugador', default: null },

    origen: { type: String, enum: ORIGENES_TIEMPO, default: 'manual' },
    creadoPor: { type: String, ref: 'Usuario', required: true },
  },
  { timestamps: true },
);

eventoSetSchema.pre('validate', function validarDueño(next) {
  if (!this.setPartido === !this.planillaSet) {
    return next(new Error('Un evento cuelga de un setPartido o de un planillaSet, exactamente uno'));
  }
  if (this.tipo === 'out' && !this.motivo) return next(new Error('Un out necesita motivo'));
  if (this.tipo !== 'out') {
    this.motivo = null;
    this.por = null;
  }
  if (this.tipo === 'cambio' && !this.entra) return next(new Error('Un cambio necesita quién entra'));
  return next();
});

export default model('EventoSet', eventoSetSchema);
