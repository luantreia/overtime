// server/models/Partido.js
import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const PartidoSchema = new Schema({
  liga: { type: String, required: true, trim: true },
  modalidad: { type: String, enum: ['Foam', 'Cloth'], required: true, trim: true },
  categoria: { type: String, enum: ['Masculino', 'Femenino', 'Mixto', 'Libre'], required: true, trim: true },
  fecha: { type: Date, required: true },
  ubicacion: {type: String, trim: true },
  equipoLocal: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
  equipoVisitante: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
  marcadorLocal: { type: Number, default: 0},
  marcadorVisitante: { type: Number, default: 0},
  creadoPor: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  administradores: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
        marcadorLocalSet: { type: Number, default: 0 },
        marcadorVisitanteSet: { type: Number, default: 0 },
        estadoSet: { type: String, enum: ['en_juego', 'finalizado'], default: 'en_juego' },
        statsJugadoresSet: [
          {
            jugador: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador', required: true },
            equipo: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
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

    const local = set.marcadorLocalSet;
    const visitante = set.marcadorVisitanteSet;

    if (esCloth) {
      if (local > visitante) {
        puntosLocal += 2;
      } else if (local === visitante) {
        puntosLocal += 1;
        puntosVisitante += 1;
      } else {
        puntosVisitante += 2;
      }
    } else if (esFoam) {
      if (local > visitante) {
        puntosLocal += 1;
      } else if (visitante > local) {
        puntosVisitante += 1;
      } else {
        // Empate no permitido en Foam, no sumamos puntos
      }
    }
  }

  this.marcadorLocal = puntosLocal;
  this.marcadorVisitante = puntosVisitante;
};

// Hook que recalcula el marcador antes de guardar
PartidoSchema.pre('save', function(next) {
    // Validación de empate en modalidad Foam
  if (this.modalidad === 'Foam') {
    for (const set of this.sets) {
      if (set.estadoSet === 'finalizado' && set.marcadorLocalSet === set.marcadorVisitanteSet) {
        return next(new Error('No se permiten empates en sets para la modalidad Foam.'));
      }
    }
  }
  this.recalcularMarcador();
  next();
});

PartidoSchema.virtual('nombre').get(function() {
  const localName = this.equipoLocal ? this.equipoLocal.nombre : (this.equipoLocal || 'Equipo Local');
  const visitanteName = this.equipoVisitante ? this.equipoVisitante.nombre : (this.equipoVisitante || 'Equipo Visitante');
  return `${localName} vs ${visitanteName} - ${this.liga} - ${this.modalidad} - ${this.categoria}`;
});

PartidoSchema.set('toJSON', { virtuals: true });
PartidoSchema.set('toObject', { virtuals: true });

export default mongoose.model('Partido', PartidoSchema);
