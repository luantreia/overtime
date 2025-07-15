import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** JugadorEquipo **/
const jugadorEquipoSchema = new Schema({
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true, index: true },
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true, index: true },

  desde: Date,
  hasta: Date,

  activo: { type: Boolean, default: false },

  estado: {
    type: String,
    enum: ['pendiente', 'aceptado', 'rechazado', 'cancelado', 'finalizado'],
    default: 'pendiente',
    index: true,
  },

  solicitadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
  origen: { type: String, enum: ['equipo', 'jugador'], required: true },

  fechaSolicitud: { type: Date, default: Date.now },
  fechaAceptacion: Date,
  motivoRechazo: String,
  foto: String,

  creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  administradores: [{ type: Schema.Types.ObjectId, ref: 'Usuario' }],

  nombreJugadorEquipo: { type: String, index: true }, // persistido para búsquedas
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para nombre combinado
jugadorEquipoSchema.virtual('nombreJugadorEquipoVirtual').get(function() {
  if (this.populated('jugador') && this.populated('equipo')) {
    return `${this.jugador.nombre} - ${this.equipo.nombre}`;
  }
  return undefined;
});

// Pre-save para persistir nombreJugadorEquipo
jugadorEquipoSchema.pre('save', async function(next) {
  if (!this.isModified('jugador') && !this.isModified('equipo')) return next();

  try {
    const jugador = await model('Jugador').findById(this.jugador).select('nombre');
    const equipo = await model('Equipo').findById(this.equipo).select('nombre');
    this.nombreJugadorEquipo = jugador && equipo ? `${jugador.nombre} - ${equipo.nombre}` : undefined;
    next();
  } catch (err) {
    next(err);
  }
});

export default model('JugadorEquipo', jugadorEquipoSchema);

