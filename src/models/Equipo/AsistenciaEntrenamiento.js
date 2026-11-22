import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * AsistenciaEntrenamiento - qué hizo cada jugador en una sesión.
 *
 * Una fila por jugador y por entrenamiento. Se guarda `jugador` y no `jugadorEquipo` a
 * propósito: un jugador puede terminar su contrato y volver más adelante, y su historial de
 * asistencia sigue siendo suyo. Colgarlo del contrato lo partiría en pedazos.
 */
const asistenciaEntrenamientoSchema = new Schema(
  {
    entrenamiento: { type: Schema.Types.ObjectId, ref: 'Entrenamiento', required: true, index: true },
    jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true, index: true },

    /**
     * `convocado` es el estado inicial: el jugador está citado y todavía no se sabe qué pasó.
     * Distinguirlo de `ausente` importa — sin eso, un entrenamiento cuya asistencia nadie marcó
     * se vería como si hubiera faltado el plantel entero.
     *
     * `justificado` no cuenta como presente pero tampoco como falta en el porcentaje: un
     * jugador lesionado no tiene por qué arrastrar un número que después se lee como desinterés.
     */
    estado: {
      type: String,
      enum: ['convocado', 'presente', 'tarde', 'ausente', 'justificado'],
      default: 'convocado',
      index: true,
    },

    /**
     * Lo que el JUGADOR dijo antes del entrenamiento ("voy / no voy"). Va separado de `estado`
     * a propósito: `estado` es lo que el staff marca después (lo que pasó), `respuesta` es lo
     * que el jugador anticipó. Mezclarlos haría que un "voy" pise un "ausente" real, o que
     * marcar asistencia borre la intención — y comparar las dos cosas es justamente útil.
     */
    respuesta: {
      type: String,
      enum: ['sin_respuesta', 'voy', 'no_voy'],
      default: 'sin_respuesta',
    },
    respuestaMotivo: { type: String, trim: true, default: '', maxlength: 200 },
    respondidoEn: { type: Date, default: null },

    /** Minutos de demora, cuando el estado es 'tarde'. */
    minutosTarde: { type: Number, default: 0, min: 0 },

    notas: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// Un jugador no puede tener dos asistencias en el mismo entrenamiento.
asistenciaEntrenamientoSchema.index({ entrenamiento: 1, jugador: 1 }, { unique: true });

export default model('AsistenciaEntrenamiento', asistenciaEntrenamientoSchema);
