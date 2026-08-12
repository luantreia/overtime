import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// Plantilla de recurrencia. No la juegan los partidos directamente:
// cada semana se materializa como una Actividad concreta (ver Actividad.js,
// campo origenRecurrente), y los Partido de esa semana quedan linkeados
// a esa instancia puntual, no a esta plantilla.
const actividadRecurrenteSchema = new Schema({
  nombre: { type: String, required: true, trim: true },
  tipo: {
    type: String,
    enum: ['lod', 'recreativo', 'jornada', 'evento', 'taller'],
    required: true,
  },

  sede: { type: Schema.Types.ObjectId, ref: 'Sede', default: null },
  ubicacion: { type: String, trim: true, default: '' },
  organizacion: { type: Schema.Types.ObjectId, ref: 'Organizacion', default: null },

  diaSemana: {
    type: String,
    enum: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'],
    required: true,
  },
  horaInicio: { type: String, required: true }, // "23:00"
  horaFin: { type: String, required: true },    // "00:30" (cruza medianoche: se resuelve al materializar la instancia)

  abiertoA: {
    type: String,
    enum: ['cualquiera', 'inscriptos', 'solo_competencia'],
    default: 'cualquiera',
  },
  permiteEspectadores: { type: Boolean, default: true },
  descripcion: { type: String, trim: true, default: '' },
  visibilidadPublica: { type: Boolean, default: true },

  activa: { type: Boolean, default: true }, // pausar la recurrencia sin perder el historial de instancias ya generadas

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],
}, { timestamps: true });

export default model('ActividadRecurrente', actividadRecurrenteSchema);
