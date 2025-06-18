// server/models/Partido.js
import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const PartidoSchema = new Schema({
  liga: { type: String, required: true, trim: true },
  modalidad: { type: String, enum: ['Foam', 'Cloth'], required: true, trim: true },
  categoria: { type: String, enum: ['Masculino', 'Femenino', 'Mixto'], required: true, trim: true },
  fecha: { type: Date, required: true },
  equipoLocal: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
  equipoVisitante: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
  marcadorLocal: { type: Number, default: 0 },
  marcadorVisitante: { type: Number, default: 0 },
  administradores: { type: [String], required: true },
  estado: {
    type: String,
    enum: ['programado', 'en_juego', 'finalizado', 'cancelado'],
    default: 'programado'
  },

  // --- NUEVO: Estructura para Sets ---
  sets: {
    type: [
      {
        numeroSet: { type: Number, required: true },
        marcadorLocalSet: { type: Number, default: 0 },
        marcadorVisitanteSet: { type: Number, default: 0 },
        estadoSet: { type: String, enum: ['en_juego', 'finalizado'], default: 'en_juego' },
        statsJugadoresSet: [
          {
            jugador: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador', required: false },
            equipo: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: false },
            throws: { type: Number, default: 0 },
            hits: { type: Number, default: 0 },
            outs: { type: Number, default: 0 },
            catches: { type: Number, default: 0 },
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
  // --- FIN NUEVA ESTRUCTURA ---
});

PartidoSchema.virtual('nombre').get(function() {
  const localName = this.equipoLocal ? this.equipoLocal.nombre : (this.equipoLocal || 'Equipo Local');
  const visitanteName = this.equipoVisitante ? this.equipoVisitante.nombre : (this.equipoVisitante || 'Equipo Visitante');
  return `${localName} vs ${visitanteName} - ${this.liga} - ${this.modalidad} - ${this.categoria}`;
});

PartidoSchema.set('toJSON', { virtuals: true });
PartidoSchema.set('toObject', { virtuals: true });

export default mongoose.model('Partido', PartidoSchema);