import mongoose from 'mongoose';

const JugadorCompetenciaSchema = new mongoose.Schema({
  jugadorEquipo: { type: mongoose.Schema.Types.ObjectId, ref: 'JugadorEquipo', required: true },
  equipoCompetencia: { type: mongoose.Schema.Types.ObjectId, ref: 'EquipoCompetencia', required: true },
  rol: { type: String, enum: ['jugador', 'capitan', 'entrenador'], default: 'jugador' },
  activo: { type: Boolean, default: true },
  desde: { type: Date },
  hasta: { type: Date },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
}, { timestamps: true });

export default mongoose.model('JugadorCompetencia', JugadorCompetenciaSchema);
