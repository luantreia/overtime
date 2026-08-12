import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const actividadSchema = new Schema({
  nombre: { type: String, required: true, trim: true },
  tipo: {
    type: String,
    enum: ['lod', 'recreativo', 'jornada', 'evento', 'taller'],
    required: true,
  },

  sede: { type: Schema.Types.ObjectId, ref: 'Sede', default: null },
  ubicacion: { type: String, trim: true, default: '' }, // texto libre de respaldo, igual que en Partido, mientras no haya Sede cargada
  organizacion: { type: Schema.Types.ObjectId, ref: 'Organizacion', default: null },

  // Si esta instancia nació de una recurrencia (ej. "los viernes"), referencia a la plantilla.
  // Los Partido de esta semana apuntan a ESTA Actividad, nunca a la plantilla.
  origenRecurrente: { type: Schema.Types.ObjectId, ref: 'ActividadRecurrente', default: null },

  fechaInicio: { type: Date, required: true },
  fechaFin: { type: Date, required: true },

  abiertoA: {
    type: String,
    enum: ['cualquiera', 'inscriptos', 'solo_competencia'],
    default: 'cualquiera',
  },
  permiteEspectadores: { type: Boolean, default: true },

  descripcion: { type: String, trim: true, default: '' },
  visibilidadPublica: { type: Boolean, default: true },

  // Anotados/presentes de esta instancia. 'inscripto' (se anotó de antemano, ej. desde la web)
  // y 'presente' (check-in real de que vino) son independientes: alguien puede inscribirse
  // y no venir (queda inscripto:true, presente:false), o venir sin haberse anotado (se agrega
  // directo con inscripto:false, presente:true). Para el flujo ranked, 'presente' se copia
  // desde 'Lobby.players[].confirmed' (el check-in por GPS) de un Lobby linkeado por 'actividad'.
  jugadores: [{
    jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true },
    inscripto: { type: Boolean, default: false },
    presente: { type: Boolean, default: false },
    origen: { type: String, enum: ['inscripcion_web', 'ranked', 'partido', 'manual'], default: 'manual' },
    inscritoEn: { type: Date, default: null },
    presenteEn: { type: Date, default: null },
  }],

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],
}, { timestamps: true });

actividadSchema.index({ sede: 1, fechaInicio: 1 });

export default model('Actividad', actividadSchema);
