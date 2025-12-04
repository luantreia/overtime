import mongoose from 'mongoose';

const EstadisticaJugadorSetSchema = new mongoose.Schema({
  setPartido: { type: mongoose.Schema.Types.ObjectId, ref: 'SetPartido', required: true, index: true },
  jugadorPartido: { type: mongoose.Schema.Types.ObjectId, ref: 'MatchPlayer', required: true },
  throws: { type: Number, default: 0 },
  hits: { type: Number, default: 0 },
  outs: { type: Number, default: 0 },
  catches: { type: Number, default: 0 },
  tipoCaptura: { type: String, enum: ['directa', 'rebote', 'defensa'], default: 'directa' },
}, { timestamps: true });

EstadisticaJugadorSetSchema.index({ setPartido: 1, jugadorPartido: 1 }, { unique: true });

export default mongoose.model('EstadisticaJugadorSet', EstadisticaJugadorSetSchema);