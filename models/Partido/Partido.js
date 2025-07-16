import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const PartidoSchema = new Schema({
  competencia: { type: Schema.Types.ObjectId, ref: 'Competencia' },
  fase: { type: Schema.Types.ObjectId, ref: 'Fase' },

  etapa: {
    type: String,
    enum: ['octavos', 'cuartos', 'semifinal', 'final', 'tercer_puesto', 'repechaje', 'otro'],
    default: null
  },

  grupo: { type: String, default: null },
  division: { type: String, default: null },

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
  participacionFaseLocal: { type: Schema.Types.ObjectId, ref: 'ParticipacionFase' },
  participacionFaseVisitante: { type: Schema.Types.ObjectId, ref: 'ParticipacionFase' },

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
  return this.participacionFaseLocal?.participacionTemporada?.equipoCompetencia?.equipo || this.equipoLocal;
});
PartidoSchema.virtual('equipoVisitanteReal').get(function () {
  return this.participacionFaseVisitante?.participacionTemporada?.equipoCompetencia?.equipo || this.equipoVisitante;
});

PartidoSchema.virtual('nombreResumido').get(function () {
  return `${this.nombrePartido || 'Partido'} (${this.fecha?.toLocaleDateString()})`;
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
PartidoSchema.pre('save', async function (next) {
  try {
    // --- 1. Completar competencia desde fase ---
    if (!this.competencia && this.fase) {
      const Fase = mongoose.model('Fase');
      const fase = await Fase.findById(this.fase).populate('competencia');
      if (fase?.competencia?._id) {
        this.competencia = fase.competencia._id;
      }
    }

    // --- 2. Completar modalidad y categoría desde competencia ---
    if (this.competencia && (!this.modalidad || !this.categoria)) {
      const Competencia = mongoose.model('Competencia');
      const comp = await Competencia.findById(this.competencia);
      if (!this.modalidad && comp?.modalidad) this.modalidad = comp.modalidad;
      if (!this.categoria && comp?.categoria) this.categoria = comp.categoria;
    }

    next();
  } catch (err) {
    next(err);
  }
});


// Hook para autocompletar grupo/división si ambos equipos están en la misma fase y coinciden
PartidoSchema.pre('save', async function (next) {
  try {
    if (!this.fase || !this.participacionFaseLocal || !this.participacionFaseVisitante) return next();

    const ParticipacionFase = mongoose.model('ParticipacionFase');

    const [local, visitante] = await Promise.all([
      ParticipacionFase.findById(this.participacionFaseLocal),
      ParticipacionFase.findById(this.participacionFaseVisitante)
    ]);

    if (!local || !visitante) return next();

    // Si ambos tienen mismo grupo
    if (local.grupo && visitante.grupo && local.grupo === visitante.grupo) {
      this.grupo = local.grupo;
    }

    // Si ambos tienen misma división
    if (local.division && visitante.division && local.division === visitante.division) {
      this.division = local.division;
    }

    next();
  } catch (err) {
    next(err);
  }
});

// Generación automática del nombre del partido
PartidoSchema.pre('save', async function(next) {
  try {
    if (this.participacionFaseLocal && !this.equipoLocal) {
      const ParticipacionFase = mongoose.model('ParticipacionFase');
      const pfLocal = await ParticipacionFase.findById(this.participacionFaseLocal).populate({
        path: 'participacionTemporada',
        populate: {
          path: 'equipoCompetencia',
          populate: 'equipo'
        }
      });
      if (pfLocal?.participacionTemporada?.equipoCompetencia?.equipo?._id) {
        this.equipoLocal = pfLocal.participacionTemporada.equipoCompetencia.equipo._id;
      }
    }

    if (this.participacionFaseVisitante && !this.equipoVisitante) {
      const ParticipacionFase = mongoose.model('ParticipacionFase');
      const pfVisitante = await ParticipacionFase.findById(this.participacionFaseVisitante).populate({
        path: 'participacionTemporada',
        populate: {
          path: 'equipoCompetencia',
          populate: 'equipo'
        }
      });
      if (pfVisitante?.participacionTemporada?.equipoCompetencia?.equipo?._id) {
        this.equipoVisitante = pfVisitante.participacionTemporada.equipoCompetencia.equipo._id;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
});

// Hook para completar nombre del partido si no está definido
PartidoSchema.pre('save', async function (next) {
  try {
    await this.populate([
      { path: 'competencia' },
      { path: 'equipoLocal' },
      { path: 'equipoVisitante' },
      {
        path: 'participacionFaseLocal',
        populate: {
          path: 'participacionTemporada',
          populate: {
            path: 'equipoCompetencia',
            populate: { path: 'equipo' }
          }
        }
      },
      {
        path: 'participacionFaseVisitante',
        populate: {
          path: 'participacionTemporada',
          populate: {
            path: 'equipoCompetencia',
            populate: { path: 'equipo' }
          }
        }
      }
    ]);

    const nombreLocal = this.participacionFaseLocal?.participacionTemporada?.equipoCompetencia?.equipo?.nombre || this.equipoLocal?.nombre || 'Local';
    const nombreVisitante = this.participacionFaseVisitante?.participacionTemporada?.equipoCompetencia?.equipo?.nombre || this.equipoVisitante?.nombre || 'Visitante';

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
