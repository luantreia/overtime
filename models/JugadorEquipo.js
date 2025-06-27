const jugadorEquipoSchema = new mongoose.Schema({
  jugador: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador', required: true },
  equipo: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipo', required: true },
  desde: Date,
  hasta: Date,
  activo: { type: Boolean, default: true },
  estado: { type: String, enum: ['pendiente', 'aceptado'], default: 'aceptado' },
  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],
  nombreJugadorEquipo: { type: String, index: true }, // 🔥 persistido
}, { timestamps: true });

// Virtual opcionalmente lo podés mantener
jugadorEquipoSchema.virtual('nombreJugadorEquipoVirtual').get(function () {
  if (this.populated('jugador') && this.populated('equipo')) {
    return `${this.jugador.nombre} - ${this.equipo.nombre}`;
  }
  return undefined;
});

jugadorEquipoSchema.set('toObject', { virtuals: true });
jugadorEquipoSchema.set('toJSON', { virtuals: true });

// Pre-save que persiste el nombre
jugadorEquipoSchema.pre('save', async function (next) {
  if (!this.isModified('jugador') && !this.isModified('equipo')) return next();
  try {
    const Jugador = mongoose.model('Jugador');
    const Equipo = mongoose.model('Equipo');
    const jugador = await Jugador.findById(this.jugador).select('nombre');
    const equipo = await Equipo.findById(this.equipo).select('nombre');
    this.nombreJugadorEquipo = jugador && equipo ? `${jugador.nombre} - ${equipo.nombre}` : undefined;
    next();
  } catch (err) {
    next(err);
  }
});
