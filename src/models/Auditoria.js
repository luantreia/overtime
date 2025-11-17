import mongoose from 'mongoose';

const AuditoriaSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  entidad: { type: String, required: true }, // 'Equipo', 'Jugador', etc.
  entidadId: { type: mongoose.Schema.Types.ObjectId, required: true },
  accion: { 
    type: String, 
    enum: ['CREATE', 'UPDATE', 'DELETE', 'APPROVE'], 
    required: true 
  },
  cambios: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
  },
  ip: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now, index: true },
});

export default mongoose.model('Auditoria', AuditoriaSchema);