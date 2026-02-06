import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/** Jugador **/
const jugadorSchema = new Schema({
  nombre: { type: String, required: true },
  alias: { type: String },
  fechaNacimiento: { type: Date },
  genero: { type: String, enum: ['masculino', 'femenino', 'otro'], default: 'otro' },
  foto: { type: String },
  nacionalidad: { type: String, default: '' },

  // Vínculo con el Usuario (Dueño del perfil)
  userId: { type: String, ref: 'Usuario', default: null },
  perfilReclamado: { type: Boolean, default: false },

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],
}, { timestamps: true });

// Edad virtual
jugadorSchema.virtual('edad').get(function() {
  if (!this.fechaNacimiento) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - this.fechaNacimiento.getFullYear();
  const m = hoy.getMonth() - this.fechaNacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < this.fechaNacimiento.getDate())) edad--;
  return edad;
});

// Eliminar JugadorEquipo al borrar jugador
jugadorSchema.pre('remove', async function(next) {
  await model('JugadorEquipo').deleteMany({ jugador: this._id });
  next();
});

jugadorSchema.set('toJSON', { virtuals: true });
jugadorSchema.set('toObject', { virtuals: true });

export default model('Jugador', jugadorSchema);