// server/models/Partido.js
import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const PartidoSchema = new Schema({
  competencia: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competencia',
    required: false,
  },
  nombrePartido: { type: String, trim: true },
  modalidad: { type: String, enum: ['Foam', 'Cloth'], required: true, trim: true },
  categoria: { type: String, enum: ['Masculino', 'Femenino', 'Mixto', 'Libre'], required: true, trim: true },
  fecha: { type: Date, required: true },
  ubicacion: {type: String, trim: true },
  equipoLocal: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
  equipoVisitante: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
  marcadorLocal: { type: Number, default: 0},
  marcadorVisitante: { type: Number, default: 0},
  creadoPor: { 
    type: String,
    ref: 'Usuario',
    required: true,
  },
  administradores: [
    {
      type: String,
      ref: 'Usuario',
    }
  ],
  estado: {
    type: String,
    enum: ['programado', 'en_juego', 'finalizado', 'cancelado'],
    default: 'programado'
  },
  sets: {
    type: [
      {
        numeroSet: { type: Number, required: true },
        ganadorSet: { type: String, enum: ['local', 'visitante', 'empate', 'pendiente'], default: 'pendiente' },
        estadoSet: { type: String, enum: ['en_juego', 'finalizado'], default: 'en_juego' },
        statsJugadoresSet: [
          {
            jugador: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador'},
            equipo: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo'},
            estadisticas: {
              throws: { type: Number, default: 0 },
              hits: { type: Number, default: 0 },
              outs: { type: Number, default: 0 },
              catches: { type: Number, default: 0 },
            },
            _id: false
          }
        ],
        _id: false
      }
    ],
    validate: {
      validator: function (sets) {
        const numeros = sets.map(s => s.numeroSet);
        return new Set(numeros).size === numeros.length;
      },
      message: 'No puede haber dos sets con el mismo número.'
    }
  }
});

// Método de instancia para recalcular el marcador general según modalidad
PartidoSchema.methods.recalcularMarcador = function () {
  let puntosLocal = 0;
  let puntosVisitante = 0;

  const esCloth = this.modalidad === 'Cloth';
  const esFoam = this.modalidad === 'Foam';

  for (const set of this.sets) {
    if (set.estadoSet !== 'finalizado') continue;

    if (esCloth) {
      if (set.ganadorSet === 'local') {
        puntosLocal += 2;
      } else if (set.ganadorSet === 'visitante') {
        puntosVisitante += 2;
      } else if (set.ganadorSet === 'empate') {
        puntosLocal += 1;
        puntosVisitante += 1;
      }
    } else if (esFoam) {
      if (set.ganadorSet === 'local') {
        puntosLocal += 1;
      } else if (set.ganadorSet === 'visitante') {
        puntosVisitante += 1;
      }
      // Empate no permitido en Foam
    }
  }

  this.marcadorLocal = puntosLocal;
  this.marcadorVisitante = puntosVisitante;
};

PartidoSchema.pre('save', async function (next) {
  try {
    // Validación de empate en modalidad Foam
    if (this.modalidad === 'Foam') {
      for (const set of this.sets) {
        if (set.estadoSet === 'finalizado' && set.ganadorSet === 'empate') {
          return next(new Error('No se permiten empates en sets para la modalidad Foam.'));
        }
      }
    }

    // Recalcular marcador
    this.recalcularMarcador();

    // Autogenerar nombre del partido
    if (this.competencia && !this.populated('competencia')) {
      await this.populate('competencia');
    }
    if (!this.populated('equipoLocal')) {
      await this.populate('equipoLocal');
    }
    if (!this.populated('equipoVisitante')) {
      await this.populate('equipoVisitante');
    }

    const nombreLocal = this.equipoLocal?.nombre || 'Local';
    const nombreVisitante = this.equipoVisitante?.nombre || 'Visitante';
    const categoria = this.categoria || '';
    const modalidad = this.modalidad || '';

    if (this.competencia) {
      this.nombrePartido = `${this.competencia.nombre} - ${nombreLocal} vs ${nombreVisitante}`;
    } else {
      this.nombrePartido = `${nombreLocal} vs ${nombreVisitante} - ${categoria} - ${modalidad} - Amistoso`;
    }

    next();
  } catch (err) {
    next(err);
  }
});


PartidoSchema.set('toJSON', { virtuals: true });
PartidoSchema.set('toObject', { virtuals: true });

export default mongoose.model('Partido', PartidoSchema);
