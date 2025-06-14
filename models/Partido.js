import mongoose from 'mongoose';

const partidoSchema = new mongoose.Schema({
  liga: { type: String, required: true },
  modalidad: { type: String, required: true },    // lo agregamos para el ejemplo
  categoria: { type: String, required: true },   // lo agregamos también
  fecha: { type: Date, required: true },
  equipos: {
    type: [String], // ids o nombres de equipos
    required: true,
    validate: [arr => arr.length === 2, 'Deben ser dos equipos exactamente'],
  },
});

// Campo virtual para nombre del partido
partidoSchema.virtual('nombre').get(function() {
  // Aquí armamos el nombre combinando datos
  return `${this.equipos[0]} vs ${this.equipos[1]} - ${this.liga} - ${this.modalidad} - ${this.categoria}`;
});

// Para que los virtuales se incluyan en el toJSON y toObject
partidoSchema.set('toJSON', { virtuals: true });
partidoSchema.set('toObject', { virtuals: true });

const Partido = mongoose.model('Partido', partidoSchema);

export default Partido;
