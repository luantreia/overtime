import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const PartidoSchema = new Schema({
  competencia: { type: Schema.Types.ObjectId, ref: 'Competencia' },
  fase: { type: Schema.Types.ObjectId, ref: 'Fase' },

  nombrePartido: { type: String, trim: true },

  modalidad: {
    type: String,
    enum: ['Foam', 'Cloth'],
    required: true,
    trim: true
  },
  categoria: {
    type: String,
    enum: ['Masculino', 'Femenino', 'Mixto', 'Libre'],
    required: true,
    trim: true
  },
  fecha: { type: Date, required: true },
  ubicacion: { type: String, trim: true },

  equipoLocal: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
  equipoVisitante: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
  equipoCompetenciaLocal: { type: Schema.Types.ObjectId, ref: 'EquipoCompetencia' },
  equipoCompetenciaVisitante: { type: Schema.Types.ObjectId, ref: 'EquipoCompetencia' },

  marcadorLocal: { type: Number, default: 0 },
  marcadorVisitante: { type: Number, default: 0 },

  marcadorModificadoManualmente: { type: Boolean, default: false }, // <-- nuevo campo

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],

  estado: {
    type: String,
    enum: ['programado', 'en_juego', 'finalizado', 'cancelado'],
    default: 'programado'
  }
}, { timestamps: true });

// Virtuales para equipos reales
PartidoSchema.virtual('equipoLocalReal').get(function () {
  return this.equipoCompetenciaLocal?.equipo || this.equipoLocal;
});
PartidoSchema.virtual('equipoVisitanteReal').get(function () {
  return this.equipoCompetenciaVisitante?.equipo || this.equipoVisitante;
});

// Método para recalcular marcador a partir de sets
PartidoSchema.methods.recalcularMarcador = async function () {
  if (this.marcadorModificadoManualmente) {
    // Si fue modificado manualmente, no recalculamos automático
    return;
  }

  const SetPartido = mongoose.model('SetPartido');
  const sets = await SetPartido.find({ partido: this._id });

  let puntosLocal = 0;
  let puntosVisitante = 0;

  for (const set of sets) {
    if (set.estadoSet !== 'finalizado') continue;

    if (this.modalidad === 'Cloth') {
      if (set.ganadorSet === 'local') puntosLocal += 2;
      else if (set.ganadorSet === 'visitante') puntosVisitante += 2;
      else if (set.ganadorSet === 'empate') {
        puntosLocal += 1;
        puntosVisitante += 1;
      }
    } else if (this.modalidad === 'Foam') {
      if (set.ganadorSet === 'local') puntosLocal += 1;
      else if (set.ganadorSet === 'visitante') puntosVisitante += 1;
    }
  }

  this.marcadorLocal = puntosLocal;
  this.marcadorVisitante = puntosVisitante;

  await this.save();
};

// Hook para completar modalidad/categoría y nombre
PartidoSchema.pre('validate', async function (next) {
  try {
    if (this.competencia) {
      await this.populate('competencia');
      if (!this.modalidad) this.modalidad = this.competencia.modalidad;
      if (!this.categoria) this.categoria = this.competencia.categoria;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Generación automática del nombre
PartidoSchema.pre('save', async function (next) {
  try {
    await this.populate('competencia equipoLocal equipoVisitante equipoCompetenciaLocal equipoCompetenciaVisitante');

    const nombreLocal = this.equipoCompetenciaLocal?.nombre || this.equipoLocal?.nombre || 'Local';
    const nombreVisitante = this.equipoCompetenciaVisitante?.nombre || this.equipoVisitante?.nombre || 'Visitante';

    if (!this.nombrePartido) {
      if (this.competencia) {
        this.nombrePartido = `${this.competencia.nombre} - ${nombreLocal} vs ${nombreVisitante}`;
      } else {
        this.nombrePartido = `${nombreLocal} vs ${nombreVisitante} - ${this.categoria} - ${this.modalidad}`;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
});

PartidoSchema.set('toJSON', { virtuals: true });
PartidoSchema.set('toObject', { virtuals: true });

export default mongoose.model('Partido', PartidoSchema);
