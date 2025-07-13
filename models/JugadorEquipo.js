import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const jugadorEquipoSchema = new Schema({
  jugador: {
    type: Schema.Types.ObjectId,
    ref: 'Jugador',
    required: true,
    index: true,
  },
  equipo: {
    type: Schema.Types.ObjectId,
    ref: 'Equipo',
    required: true,
    index: true,
  },

  desde: Date,
  hasta: Date,

  activo: {
    type: Boolean,
    default: false, // Solo se activa cuando se acepta
  },

  estado: {
    type: String,
    enum: ['pendiente', 'aceptado', 'rechazado', 'cancelado', 'finalizado'],
    default: 'pendiente',
    index: true,
  },

  solicitadoPor: {
    type: String,
    ref: 'Usuario',
  },
    // Nuevo campo para indicar origen de la solicitud
  origen: {
    type: String,
    enum: ['equipo', 'jugador'],
    required: true,
  },

  fechaSolicitud: {
    type: Date,
    default: Date.now,
  },

  fechaAceptacion: {
    type: Date,
  },

  motivoRechazo: {
    type: String,
  },

  foto: {
    type: String,
  },

  creadoPor: {
    type: String,
    ref: 'Usuario',
    required: true,
  },

  administradores: [{
    type: String,
    ref: 'Usuario',
  }],

  // Persistido automáticamente con el pre-save
  nombreJugadorEquipo: {
    type: String,
    index: true,
  },

}, {
  timestamps: true,
  toObject: { virtuals: true },
  toJSON: { virtuals: true },
});

// --- Virtual para nombre combinado, si están poblados
jugadorEquipoSchema.virtual('nombreJugadorEquipoVirtual').get(function () {
  if (this.populated('jugador') && this.populated('equipo')) {
    return `${this.jugador.nombre} - ${this.equipo.nombre}`;
  }
  return undefined;
});

// --- Pre-save: persistencia de nombreJugadorEquipo
jugadorEquipoSchema.pre('save', async function (next) {
  if (!this.isModified('jugador') && !this.isModified('equipo')) return next();

  try {
    const Jugador = mongoose.model('Jugador');
    const Equipo = mongoose.model('Equipo');

    const jugador = await Jugador.findById(this.jugador).select('nombre');
    const equipo = await Equipo.findById(this.equipo).select('nombre');

    if (jugador && equipo) {
      this.nombreJugadorEquipo = `${jugador.nombre} - ${equipo.nombre}`;
    } else {
      this.nombreJugadorEquipo = undefined;
    }

    next();
  } catch (err) {
    next(err);
  }
});

export default model('JugadorEquipo', jugadorEquipoSchema);
