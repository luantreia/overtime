import mongoose from 'mongoose';

const EquipoCompetenciaSchema = new mongoose.Schema({
  equipo: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
  competencia: { type: mongoose.Schema.Types.ObjectId, ref: 'Competencia', required: true },
  jugadoresCompetencia: [{ type: mongoose.Schema.Types.ObjectId, ref: 'JugadorCompetencia' }],
  activo: { type: Boolean, default: true },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  administradores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],
}, { timestamps: true });

export default mongoose.model('EquipoCompetencia', EquipoCompetenciaSchema);
