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
  estado: {
    type: String,
    enum: ['programado', 'en_juego', 'finalizado', 'cancelado'],
    default: 'programado'
  },

  // --- NUEVO: Estructura para Sets ---
  sets: [
    {
      numeroSet: { type: Number, required: true },
      // Opcional: marcador del set si es relevante
      marcadorLocalSet: { type: Number, default: 0 },
      marcadorVisitanteSet: { type: Number, default: 0 },
      // Estado del set (ej. 'finalizado', 'en_juego')
      estadoSet: { type: String, enum: ['en_juego', 'finalizado'], default: 'en_juego' },

      // Estadísticas de los jugadores para ESTE SET
      statsJugadoresSet: [
        {
          jugador: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador', required: true },
          equipo: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
          // Las estadísticas que quieres por jugador y por set
          lanzamientos: { type: Number, default: 0 }, // Launches / Throws
          hits: { type: Number, default: 0 },         // Successful hits/eliminations
          outs: { type: Number, default: 0 },         // Times player was out
          capturas: { type: Number, default: 0 },     // Catches
          // Puedes agregar más aquí si lo necesitas (ej. asistencias, bloqueos, etc.)
          _id: false // Para evitar que Mongoose cree un _id para cada subdocumento de stat
        }
      ],
      _id: false // Para evitar que Mongoose cree un _id para cada subdocumento de set
    }
  ]
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