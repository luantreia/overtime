// server/models/Partido.js
import mongoose from 'mongoose';

const PartidoSchema = new mongoose.Schema({
  // Liga as a String for now, as you requested
  liga: {
    type: String,
    required: true,
    trim: true
  },
  modalidad: {
    type: String,
    enum: ['Foam', 'Cloth'], // Added enum for validation as per frontend
    required: true,
    trim: true
  },
  categoria: {
    type: String,
    enum: ['Masculino', 'Femenino', 'Mixto'], // Added enum for validation as per frontend
    required: true,
    trim: true
  },
  fecha: {
    type: Date,
    required: true
  },
  // --- IMPORTANT: Use separate fields for local and visitor teams ---
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
  // --- Add fields for scores as per frontend ---
  marcadorLocal: {
    type: Number,
    default: 0
  },
  marcadorVisitante: {
    type: Number,
    default: 0
  },
  // You might consider adding `goles` and `eventos` arrays here later if needed
  // as discussed in previous responses.
});

// --- Campo virtual para nombre del partido ---
// This virtual will now use equipoLocal and equipoVisitante (after population)
partidoSchema.virtual('nombre').get(function() {
  // Check if teams are populated; if not, use the raw ID or a placeholder.
  // Assuming your Equipo model has a 'nombre' field.
  const localName = this.equipoLocal ? this.equipoLocal.nombre : (this.equipoLocal || 'Equipo Local');
  const visitanteName = this.equipoVisitante ? this.equipoVisitante.nombre : (this.equipoVisitante || 'Equipo Visitante');

  return `${localName} vs ${visitanteName} - ${this.liga} - ${this.modalidad} - ${this.categoria}`;
});

// Para que los virtuales se incluyan en el toJSON y toObject
partidoSchema.set('toJSON', { virtuals: true });
partidoSchema.set('toObject', { virtuals: true });

export default mongoose.model('Partido', PartidoSchema);

