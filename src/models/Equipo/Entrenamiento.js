import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * Entrenamiento - una sesión del equipo, con su convocatoria y su asistencia.
 *
 * Es la primera entidad de la app que no gira alrededor de un partido. Un DT usa el panel el
 * día que juega; con entrenamientos lo usa todas las semanas, y la asistencia acumulada es de
 * los pocos datos que explican el rendimiento sin necesidad de que nadie cargue estadísticas.
 *
 * Vive completamente dentro del equipo: no lo aprueba ninguna organización, no participa del
 * flujo de SolicitudEdicion y no toca ningún dato de competencia. Por eso no tiene estados de
 * publicación ni de oficialización — es información privada del equipo y punto.
 */
const entrenamientoSchema = new Schema(
  {
    equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true, index: true },

    /** Momento de inicio. Se guarda como instante completo, no como día suelto. */
    fecha: { type: Date, required: true },
    duracionMinutos: { type: Number, default: 90, min: 0 },

    lugar: { type: String, trim: true, default: '' },
    sede: { type: Schema.Types.ObjectId, ref: 'Sede', default: null },

    /**
     * Para qué fue la sesión. Sirve para cruzar asistencia contra tipo de trabajo: si el equipo
     * falta sistemáticamente a los físicos y no a los tácticos, eso es información.
     */
    tipo: {
      type: String,
      enum: ['general', 'fisico', 'tactico', 'tecnico', 'amistoso_interno', 'otro'],
      default: 'general',
    },

    /**
     * 'programado' se convierte en 'realizado' cuando se carga la asistencia: mientras nadie
     * la marcó, contar ese entrenamiento en los porcentajes castigaría a todo el plantel por
     * una sesión que quizá ni ocurrió.
     */
    estado: {
      type: String,
      enum: ['programado', 'realizado', 'cancelado'],
      default: 'programado',
      index: true,
    },

    titulo: { type: String, trim: true, default: '' },
    notas: { type: String, trim: true, default: '' },

    creadoPor: { type: String, ref: 'Usuario', required: true },
  },
  { timestamps: true }
);

// La consulta natural es "los entrenamientos de mi equipo, del más reciente al más viejo".
entrenamientoSchema.index({ equipo: 1, fecha: -1 });

export default model('Entrenamiento', entrenamientoSchema);
