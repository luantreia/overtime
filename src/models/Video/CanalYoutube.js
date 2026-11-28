import mongoose from 'mongoose';
import { RX_CANAL_YOUTUBE } from '../../services/vivoYoutubeService.js';
const { Schema } = mongoose;

/**
 * Canal de YouTube guardado en el catálogo (Overtime-Admin). Sirve para dos cosas:
 *  - importar videos suyos al catálogo eligiéndolos de una lista (routes/canalesYoutube.js);
 *  - elegirlo como fuente de vivos de un CanalTv (`CanalTv.fuentesYoutube`).
 */
const CanalYoutubeSchema = new Schema(
  {
    channelId: { type: String, required: true, unique: true, match: RX_CANAL_YOUTUBE },
    nombre: { type: String, trim: true, default: '' },
    creadoPor: { type: String, ref: 'Usuario', default: null },
  },
  { timestamps: true },
);

export default mongoose.models.CanalYoutube || mongoose.model('CanalYoutube', CanalYoutubeSchema);
