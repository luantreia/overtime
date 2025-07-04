import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const PartidoSchema = new Schema({
  competencia: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competencia',
  },
  fase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
  },

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
  fecha: {
    type: Date,
    required: true
  },
  ubicacion: { type: String, trim: true },

  // Equipos base obligatorios
  equipoLocal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true
  },
  equipoVisitante: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true
  },

  // Equipos en competencia (opcional)
  equipoCompetenciaLocal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EquipoCompetencia'
  },
  equipoCompetenciaVisitante: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EquipoCompetencia'
  },

  marcadorLocal: { type: Number, default: 0 },
  marcadorVisitante: { type: Number, default: 0 },

  creadoPor: {
    type: String,
    ref: 'Usuario',
    required: true
  },
  administradores: [
    { type: String, ref: 'Usuario' }
  ],

  estado: {
    type: String,
    enum: ['programado', 'en_juego', 'finalizado', 'cancelado'],
    default: 'programado'
  },

  sets: [{
    numeroSet: { type: Number, required: true },
    ganadorSet: {
      type: String,
      enum: ['local', 'visitante', 'empate', 'pendiente'],
      default: 'pendiente'
    },
    estadoSet: {
      type: String,
      enum: ['en_juego', 'finalizado'],
      default: 'en_juego'
    },
    statsJugadoresSet: [{
      jugador: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador', required: true },
      equipo: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },

      jugadorEquipo: { type: mongoose.Schema.Types.ObjectId, ref: 'JugadorEquipo' }, // opcional: solo amistosos
      jugadorCompetencia: { type: mongoose.Schema.Types.ObjectId, ref: 'JugadorCompetencia' }, // opcional: competencias
      equipoCompetencia: { type: mongoose.Schema.Types.ObjectId, ref: 'EquipoCompetencia' }, // opcional: competencias

      estadisticas: {
        throws: { type: Number, default: 0 },
        hits: { type: Number, default: 0 },
        outs: { type: Number, default: 0 },
        catches: { type: Number, default: 0 },
      },
      _id: false
    }],
    _id: false
  }]
}, { timestamps: true });

// Hook para sincronizar modalidad y categoria desde competencia antes de validar
PartidoSchema.pre('validate', async function (next) {
  try {
    if (this.competencia) {
      await this.populate('competencia');
      // Solo sobreescribir si no están seteados o querés forzar la sincronización
      if (!this.modalidad) this.modalidad = this.competencia.modalidad;
      if (!this.categoria) this.categoria = this.competencia.categoria;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Virtuales para equipos "reales"
PartidoSchema.virtual('equipoLocalReal').get(function () {
  return this.equipoCompetenciaLocal?.equipo || this.equipoLocal;
});
PartidoSchema.virtual('equipoVisitanteReal').get(function () {
  return this.equipoCompetenciaVisitante?.equipo || this.equipoVisitante;
});

// Recalcular marcador
PartidoSchema.methods.recalcularMarcador = function () {
  let puntosLocal = 0;
  let puntosVisitante = 0;

  for (const set of this.sets) {
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
};

// Validación y generación nombrePartido
PartidoSchema.pre('save', async function (next) {
  try {
    if (this.modalidad === 'Foam') {
      for (const set of this.sets) {
        if (set.estadoSet === 'finalizado' && set.ganadorSet === 'empate') {
          return next(new Error('No se permiten empates en sets para Foam.'));
        }
      }
    }

    // Validar consistencia equipoCompetencia vs equipo base
    if (this.equipoCompetenciaLocal) {
      await this.populate('equipoCompetenciaLocal');
      if (this.equipoCompetenciaLocal.equipo.toString() !== this.equipoLocal.toString()) {
        return next(new Error('equipoCompetenciaLocal no coincide con equipoLocal.'));
      }
    }
    if (this.equipoCompetenciaVisitante) {
      await this.populate('equipoCompetenciaVisitante');
      if (this.equipoCompetenciaVisitante.equipo.toString() !== this.equipoVisitante.toString()) {
        return next(new Error('equipoCompetenciaVisitante no coincide con equipoVisitante.'));
      }
    }

    this.recalcularMarcador();

    // Autogenerar nombrePartido
    if (!this.nombrePartido || this.nombrePartido.trim() === '') {
      await this.populate('competencia equipoLocal equipoVisitante equipoCompetenciaLocal equipoCompetenciaVisitante');

      const nombreLocal = this.equipoCompetenciaLocal?.nombre || this.equipoLocal?.nombre || 'Local';
      const nombreVisitante = this.equipoCompetenciaVisitante?.nombre || this.equipoVisitante?.nombre || 'Visitante';

      if (this.competencia) {
        this.nombrePartido = `${this.competencia.nombre} - ${nombreLocal} vs ${nombreVisitante}`;
      } else {
        this.nombrePartido = `${nombreLocal} vs ${nombreVisitante} - ${this.categoria} - ${this.modalidad} - Amistoso`;
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
