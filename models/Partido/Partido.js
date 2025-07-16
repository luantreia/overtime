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

PartidoSchema.pre('save', async function (next) {
  try {
    const Fase = mongoose.model('Fase');
    const ParticipacionFase = mongoose.model('ParticipacionFase');
    const Competencia = mongoose.model('Competencia');

    // --- 1. Completar competencia desde fase ---
    if (!this.competencia && this.fase) {
      const fase = await Fase.findById(this.fase)
      .populate({
        path: 'temporada',
        populate: { path: 'competencia' }
      });
      if (fase?.temporada?.competencia?._id) {
        this.competencia = fase.temporada.competencia._id;
      }
    }

    // --- 2. Completar modalidad/categoría desde competencia ---
    if (this.competencia && (!this.modalidad || !this.categoria)) {
      const comp = await Competencia.findById(this.competencia);
      if (!this.modalidad && comp?.modalidad) this.modalidad = comp.modalidad;
      if (!this.categoria && comp?.categoria) this.categoria = comp.categoria;
    }

    // --- 3. Completar equipoLocal/equipoVisitante si vienen participaciones ---
    let pfLocal, pfVisitante;

    if (this.participacionFaseLocal && !this.equipoLocal) {
      pfLocal = await ParticipacionFase.findById(this.participacionFaseLocal).populate({
        path: 'participacionTemporada',
        populate: {
          path: 'equipoCompetencia',
          populate: 'equipo'
        }
      });
      this.equipoLocal = pfLocal?.participacionTemporada?.equipoCompetencia?.equipo?._id;
    }

    if (this.participacionFaseVisitante && !this.equipoVisitante) {
      pfVisitante = await ParticipacionFase.findById(this.participacionFaseVisitante).populate({
        path: 'participacionTemporada',
        populate: {
          path: 'equipoCompetencia',
          populate: 'equipo'
        }
      });
      this.equipoVisitante = pfVisitante?.participacionTemporada?.equipoCompetencia?.equipo?._id;
    }

    // --- 4. Completar grupo/división si coinciden ---
    if (pfLocal && pfVisitante) {
      if (pfLocal.grupo && pfVisitante.grupo && pfLocal.grupo === pfVisitante.grupo) {
        this.grupo = pfLocal.grupo;
      }
      if (pfLocal.division && pfVisitante.division && pfLocal.division === pfVisitante.division) {
        this.division = pfLocal.division;
      }
    }

    // --- 5. Generar nombre si no está ---
    const nombreLocal = pfLocal?.participacionTemporada?.equipoCompetencia?.equipo?.nombre || this.equipoLocal?.nombre || 'Local';
    const nombreVisitante = pfVisitante?.participacionTemporada?.equipoCompetencia?.equipo?.nombre || this.equipoVisitante?.nombre || 'Visitante';

    if (!this.nombrePartido) {
      if (this.competencia && this.competencia.nombre) {
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

// En el modelo Partido
PartidoSchema.post('save', async function () {
  if (this.estado !== 'finalizado') return; // Solo si está terminado

  const EquipoPartido = mongoose.model('EquipoPartido');
  const equipos = await EquipoPartido.find({ partido: this._id });

  for (const ep of equipos) {
    if (this.marcadorLocal === this.marcadorVisitante) {
      ep.resultado = 'empate';
    } else if (
      (ep.esLocal && this.marcadorLocal > this.marcadorVisitante) ||
      (!ep.esLocal && this.marcadorVisitante > this.marcadorLocal)
    ) {
      ep.resultado = 'ganado';
    } else {
      ep.resultado = 'perdido';
    }

    await ep.save();
  }
});

PartidoSchema.set('toJSON', { virtuals: true });
PartidoSchema.set('toObject', { virtuals: true });

export default mongoose.model('Partido', PartidoSchema);
