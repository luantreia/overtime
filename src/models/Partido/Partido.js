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

  marcadorModificadoManualmente: { type: Boolean, default: true }, // <-- nuevo campo

  // Timer State Persistence
  timerMatchValue: { type: Number, default: 1200 }, // 20 mins in seconds
  timerMatchRunning: { type: Boolean, default: false },
  timerMatchLastUpdate: { type: Date, default: Date.now },
  period: { type: Number, default: 1 },

  // Modo de estadísticas: 'automatico' (calculado de sets) o 'manual' (ingresado directamente)
  modoEstadisticas: {
    type: String,
    enum: ['automatico', 'manual'],
    default: 'automatico'
  },

  // Modo de visualización: qué estadísticas mostrar al público ('automatico', 'manual', 'mixto')
  modoVisualizacion: {
    type: String,
    enum: ['automatico', 'manual', 'mixto'],
    default: 'automatico'
  },

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],

  estado: {
    type: String,
    enum: ['programado', 'en_juego', 'finalizado', 'cancelado'],
    default: 'programado'
  },

  // Ranked fields (optional)
  isRanked: { type: Boolean, default: false },
  rankedMeta: {
    applied: { type: Boolean, default: false },
    modalidad: { type: String },
    categoria: { type: String },
    teamColors: {
      local: { type: String, enum: ['rojo', 'azul'] },
      visitante: { type: String, enum: ['rojo', 'azul'] }
    },
    temporadaId: { type: Schema.Types.ObjectId, ref: 'Temporada' },
    afkPlayers: [{ type: Schema.Types.ObjectId, ref: 'Jugador' }],
    startTime: { type: Date },
    endTime: { type: Date },
    // Configuración de tiempos
    matchDuration: { type: Number, default: 1200 }, // segundos
    setDuration: { type: Number, default: 180 },    // segundos
    suddenDeathLimit: { type: Number, default: 180 }, // segundos
    snapshot: {
      players: [
        {
          player: { type: Schema.Types.ObjectId, ref: 'Jugador' },
          pre: Number,
          post: Number,
          delta: Number,
          teamColor: { type: String, enum: ['rojo', 'azul'] }
        }
      ],
      teamAverages: { rojo: Number, azul: Number }
    }
  },
  ratingDeltas: [
    {
      player: { type: Schema.Types.ObjectId, ref: 'Jugador' },
      delta: Number
    }
  ]
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

// Virtual para sets
PartidoSchema.virtual('sets', {
  ref: 'SetPartido',
  localField: '_id',
  foreignField: 'partido'
});

// Virtual para equipos de ranked
PartidoSchema.virtual('matchTeams', {
  ref: 'MatchTeam',
  localField: '_id',
  foreignField: 'partidoId'
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

PartidoSchema.post('save', async function () {
  if (this.estado !== 'finalizado') return;

  // 1. Recalcular marcador si es necesario
  await this.recalcularMarcador();

  // 2. Actualizar tabla de posiciones
  const { actualizarParticipacionFase } = await import('../../services/participacionFaseService.js');
  if (this.participacionFaseLocal) {
    await actualizarParticipacionFase(this.participacionFaseLocal.toString(), this.fase.toString());
  }
  if (this.participacionFaseVisitante) {
    await actualizarParticipacionFase(this.participacionFaseVisitante.toString(), this.fase.toString());
  }

  // 3. Actualizar EquipoPartido
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

  // 4. Apply ranked rating updates once per finalized match
  try {
    if (this.isRanked && this.estado === 'finalizado' && !(this.rankedMeta?.applied)) {
      const normalizeEnum = (val) => {
        if (!val) return val;
        const s = val.toLowerCase().trim();
        if (s === 'foam') return 'Foam';
        if (s === 'cloth') return 'Cloth';
        if (s === 'masculino') return 'Masculino';
        if (s === 'femenino') return 'Femenino';
        if (s === 'mixto') return 'Mixto';
        if (s === 'libre') return 'Libre';
        return val;
      };

      const modalidad = normalizeEnum(this.rankedMeta?.modalidad || this.modalidad);
      const categoria = normalizeEnum(this.rankedMeta?.categoria || this.categoria);

      // Determine winner mapped to team colors
      let winner = 'empate';
      const localColor = this.rankedMeta?.teamColors?.local || 'rojo';
      const visitanteColor = this.rankedMeta?.teamColors?.visitante || 'azul';
      if (this.marcadorLocal > this.marcadorVisitante) winner = localColor;
      else if (this.marcadorVisitante > this.marcadorLocal) winner = visitanteColor;

      // Try to get temporadaId from Fase (if exists) or rankedMeta
      let temporadaId = this.rankedMeta?.temporadaId;
      if (!temporadaId && this.fase) {
        const Fase = mongoose.model('Fase');
        const faseDoc = await Fase.findById(this.fase).populate('temporada');
        temporadaId = faseDoc?.temporada?._id;
      }

      const { applyRankedResult } = await import('../../services/ratingService.js');
      const afkPlayerIds = (this.rankedMeta?.afkPlayers || []).map(id => id.toString());

      // 1. Always apply to Global (temporadaId: null) to keep all-time leaderboard updated
      const globalSnapshot = await applyRankedResult({
        partidoId: this._id,
        competenciaId: this.competencia,
        temporadaId: null,
        modalidad,
        categoria,
        result: winner,
        afkPlayerIds
      });

      let snapshot = globalSnapshot;

      // 2. If Season exists, apply to Season and override snapshot/MatchPlayer
      if (temporadaId) {
        snapshot = await applyRankedResult({
          partidoId: this._id,
          competenciaId: this.competencia,
          temporadaId,
          modalidad,
          categoria,
          result: winner,
          afkPlayerIds
        });
      }

      this.rankedMeta = this.rankedMeta || {};
      this.rankedMeta.snapshot = snapshot;
      this.rankedMeta.applied = true;
      this.ratingDeltas = snapshot.players.map(p => ({ player: p.playerId, delta: p.delta }));
      await this.save();
    }
  } catch (err) {
    console.error('[Partido.postSave ranked] error', err);
  }
});


PartidoSchema.set('toJSON', { virtuals: true });
PartidoSchema.set('toObject', { virtuals: true });

export default mongoose.model('Partido', PartidoSchema);
