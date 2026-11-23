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

/** Dónde está un set (o cualquier tramo) en la línea de tiempo del partido. */
export const tiempoPartidoSchema = new Schema(
  {
    /** Segundos de partido. */
    desde: { type: Number, required: true, min: 0 },
    hasta: { type: Number, required: true, min: 0 },
    origen: { type: String, enum: ORIGENES_TIEMPO, default: 'manual' },
    /** Revisado por una persona (lo detectado por CV arranca sin confirmar). */
    confirmado: { type: Boolean, default: false },
  },
  { _id: false },
);
