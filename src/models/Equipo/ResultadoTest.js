import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * ResultadoTest - una medición: un jugador, un test, una fecha, un número.
 *
 * Es una entidad aparte del entrenamiento y no un campo suyo, porque lo valioso de un test no
 * es el día en que se tomó sino LA SERIE EN EL TIEMPO: "pasó de 38 a 44 cm de salto en tres
 * meses" es la frase que un DT quiere poder decir. Los tests no se toman todas las semanas ni a
 * todo el plantel junto, así que colgarlos del entrenamiento partiría la serie en pedazos.
 *
 * `entrenamiento` es opcional justamente por eso: sirve para saber en qué sesión se midió
 * cuando corresponde, sin obligar a que exista una.
 */
const resultadoTestSchema = new Schema(
  {
    /**
     * Se guarda el equipo además del jugador. Es desnormalización a propósito: la consulta real
     * es siempre "los tests de mi equipo", y sin este campo habría que resolver el plantel
     * primero y después buscar por una lista de jugadores. Además un jugador puede pasar por
     * varios equipos y sus mediciones pertenecen al que se las tomó.
     */
    equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true, index: true },
    jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true, index: true },
    tipoTest: { type: Schema.Types.ObjectId, ref: 'TipoTest', required: true, index: true },

    /**
     * El DÍA de la medición, normalizado a medianoche UTC por la ruta que lo guarda. Sin hora a
     * propósito: un test es del día, no del momento, y dejar la hora rompería el índice único
     * de más abajo — dos mediciones del mismo día a horas distintas no colisionarían y el
     * jugador terminaría con valores duplicados que nadie sabe cuál mirar.
     */
    fecha: { type: Date, required: true },
    valor: { type: Number, required: true },

    /** En qué sesión se midió, si fue en una. */
    entrenamiento: { type: Schema.Types.ObjectId, ref: 'Entrenamiento', default: null },

    notas: { type: String, trim: true, default: '' },

    creadoPor: { type: String, ref: 'Usuario', required: true },
  },
  { timestamps: true }
);

/**
 * Un jugador puede repetir el mismo test cuantas veces quiera, pero no dos veces el mismo día:
 * si se mide de nuevo en la misma jornada, lo que corresponde es corregir el valor, no acumular
 * dos mediciones que después nadie sabe cuál mirar. El guardado hace upsert sobre esta clave.
 */
resultadoTestSchema.index({ jugador: 1, tipoTest: 1, fecha: 1 }, { unique: true });

// La consulta de la ficha: la evolución de un jugador en un test, del más viejo al más nuevo.
resultadoTestSchema.index({ equipo: 1, tipoTest: 1, fecha: 1 });

export default model('ResultadoTest', resultadoTestSchema);
