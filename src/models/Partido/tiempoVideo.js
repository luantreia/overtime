import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * Video y tiempo de partido — misma forma que el panel de análisis (realtime-cv-platform),
 * para que lo que se analiza allá se pueda traer acá sin traducir.
 *
 * Hay dos relojes:
 *  - **segundo de cámara**: la posición dentro de un video de YouTube.
 *  - **segundo de partido**: una línea de tiempo común a todas las cámaras.
 *
 * Cada cámara se alinea al partido por tramos: dentro de `cam: [desde, hasta]` (segundos de
 * cámara), segundo de partido = segundo de cámara + `d`. Hacen falta varios tramos porque una
 * grabación se corta y se reanuda: ninguna cámara tiene un `d` fijo. Un video simple de una sola
 * cámara es un tramo con `d = 0` y lo que se guarda en todo el resto (sets, eventos) va en
 * segundos de partido.
 */

export const ORIGENES_TIEMPO = ['manual', 'cv', 'en_vivo'];

const tramoCamaraSchema = new Schema(
  {
    /** [desde, hasta] en segundos de cámara. */
    cam: {
      type: [Number],
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 2 && v[0] >= 0 && v[1] > v[0],
        message: 'cam debe ser [desde, hasta] con desde >= 0 y hasta > desde',
      },
      required: true,
    },
    /** Desfase: segundo de partido = segundo de cámara + d. */
    d: { type: Number, default: 0 },
  },
  { _id: false },
);

export const videoPartidoSchema = new Schema({
  youtubeId: { type: String, required: true, trim: true, match: /^[\w-]{11}$/ },
  /** "Cámara principal", "Cámara 2", "Tribuna"... */
  etiqueta: { type: String, trim: true, default: '' },
  /** Duración total del video en YouTube, en segundos. null si todavía no se conoce. */
  duracion: { type: Number, default: null, min: 0 },
  /** Vacío = un tramo implícito que cubre todo el video con d = 0. */
  tramos: { type: [tramoCamaraSchema], default: [] },
});

/**
 * Reloj de la captura en vivo (Overtime-Partido). Las marcas en vivo se guardan con la hora
 * real, que avanza igual que el video (el reloj de juego se frena en pausas y entretiempo):
 * segundo de partido = segundo + (hora − ancla) / 1000. `ancla` es la hora de la primera
 * marca en vivo; `segundo` arranca en 0 y se corrige UNA vez al alinear con el video
 * (PUT /api/eventos-set/reloj-en-vivo), lo que recalcula todas las marcas en vivo del partido.
 */
export const relojEnVivoSchema = new Schema(
  {
    ancla: { type: Date, required: true },
    segundo: { type: Number, default: 0 },
    alineado: { type: Boolean, default: false },
  },
  { _id: false },
);

/** Dónde está un set (o cualquier tramo) en la línea de tiempo del partido. */
export const tiempoPartidoSchema = new Schema(
  {
    /** Segundos de partido. */
    desde: { type: Number, required: true, min: 0 },
    hasta: { type: Number, required: true, min: 0 },
    origen: { type: String, enum: ORIGENES_TIEMPO, default: 'manual' },
    /** Revisado por una persona (lo detectado por CV arranca sin confirmar). */
    confirmado: { type: Boolean, default: false },
    /** Captura en vivo: hora real (del servidor) en que se marcaron inicio y fin (ver relojEnVivo). */
    horaDesde: { type: Date, default: undefined },
    horaHasta: { type: Date, default: undefined },
  },
  { _id: false },
);

/**
 * Quiénes arrancan un set en cancha (la alineación del set). Con esto y las marcas
 * (EventoSet) se arma la línea de "vivos". Vacía = no se cargó: se usan los presentes.
 */
export const alineacionSetSchema = new Schema(
  {
    jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true },
    equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
  },
  { _id: false },
);
