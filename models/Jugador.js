import mongoose from 'mongoose';

const jugadorSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  alias: { type: String },
  fechaNacimiento: { type: Date, required: true },
  genero: { type: String, enum: ['masculino', 'femenino', 'otro'], default: 'otro' },
  foto: { type: String },
  
  creadoPor: {
    type: String,
    ref: 'Usuario', // o 'Usuario', como tengas tu modelo de usuario
    required: true,
  },

  administradores: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
    }
  ],

}, { timestamps: true });

// Edad calculada virtualmente
jugadorSchema.virtual('edad').get(function () {
  if (!this.fechaNacimiento) return null;
  const hoy = new Date();
  const nacimiento = new Date(this.fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return edad;
});

jugadorSchema.pre('remove', async function (next) {
  const jugadorId = this._id;
  await mongoose.model('JugadorEquipo').deleteMany({ jugador: jugadorId });
  next();
});

jugadorSchema.set('toJSON', { virtuals: true });
jugadorSchema.set('toObject', { virtuals: true });

export default mongoose.model('Jugador', jugadorSchema);
