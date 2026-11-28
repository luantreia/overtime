import mongoose from 'mongoose';
import { tramoCamaraSchema } from '../Partido/tiempoVideo.js';
const { Schema } = mongoose;

/**
 * Catálogo de videos: la ÚNICA fuente de los videos de Overtime.
 *
 * Un video puede ser una cámara de un partido (`partido` + `orden`; orden 0 = cámara
 * principal) o un video suelto (highlights, clínicas, promos) con `partido: null`.
 *
 * `Partido.videos` y `Partido.videoUrl` son una PROYECCIÓN de esta colección que arma
 * services/videoCatalogoService.js (`proyectarEnPartido`): las apps los siguen leyendo como
 * siempre, pero nadie los escribe directo. Para cambiar videos, pasar por ese servicio.
 */
const VideoSchema = new Schema(
  {
    youtubeId: { type: String, required: true, trim: true, match: /^[\w-]{11}$/ },
    titulo: { type: String, trim: true, default: '' },
    /** "Cámara principal", "Cámara 2", "Tribuna"... (para cámaras de partido). */
    etiqueta: { type: String, trim: true, default: '' },
    /** Duración total en YouTube, en segundos. null si todavía no se conoce. */
    duracion: { type: Number, default: null, min: 0 },
    /** Segundo donde arranca lo útil (el `t=` del link). La TV programa desde acá. */
    inicio: { type: Number, default: 0, min: 0 },
    /** Alineación con el reloj del partido (ver tiempoVideo.js). */
    tramos: { type: [tramoCamaraSchema], default: [] },

    partido: { type: Schema.Types.ObjectId, ref: 'Partido', default: null },
    /** Posición entre las cámaras del partido. 0 = principal (la que ven la TV y la ficha). */
    orden: { type: Number, default: 0 },
    competencia: { type: Schema.Types.ObjectId, ref: 'Competencia', default: null },
    organizacion: { type: Schema.Types.ObjectId, ref: 'Organizacion', default: null },

    /** false = queda en el catálogo pero no se programa en Overtime TV. */
    enTv: { type: Boolean, default: true },
    creadoPor: { type: String, ref: 'Usuario', default: null },
  },
  { timestamps: true },
);

VideoSchema.index({ partido: 1, orden: 1 });
VideoSchema.index({ competencia: 1, createdAt: -1 });
// Una misma cámara no se repite en un partido. Los videos sueltos no tienen esta restricción.
VideoSchema.index(
  { partido: 1, youtubeId: 1 },
  { unique: true, partialFilterExpression: { partido: { $type: 'objectId' } } },
);

export default mongoose.models.Video || mongoose.model('Video', VideoSchema);
