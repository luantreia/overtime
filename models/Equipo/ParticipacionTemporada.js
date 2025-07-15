import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const participacionTemporadaSchema = new Schema({
  equipoCompetencia: { type: Schema.Types.ObjectId, ref: 'EquipoCompetencia', required: true },
  temporada: { type: Schema.Types.ObjectId, ref: 'Temporada', required: true },

  desde: {
    type: Date,
    validate: {
      validator: function (value) {
        return !this.hasta || value <= this.hasta;
      },
      message: '`desde` debe ser menor o igual a `hasta`.',
    }
  },
  hasta: {
    type: Date,
    validate: {
      validator: function (value) {
        return !this.desde || value >= this.desde;
      },
      message: '`hasta` debe ser mayor o igual a `desde`.',
    }
  },

  estado: { type: String, enum: ['activo', 'baja', 'expulsado'], default: 'activo' },
  observaciones: { type: String, trim: true, default: '' },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

participacionTemporadaSchema.index({ equipoCompetencia: 1, temporada: 1 }, { unique: true });

export default model('ParticipacionTemporada', participacionTemporadaSchema);
