import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * Canal de Overtime TV. Sólo lo administra el Super Admin (Overtime-Admin).
 *
 * Qué programa un canal = `videos` (elegidos a mano) ∪ los videos de las `competencias`
 * (se suman solos a medida que se cargan). Sólo entran videos con `enTv: true`.
 */
const CanalTvSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    /** Lo que va en la URL de la TV: /tv?canal=<slug>. */
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, match: /^[a-z0-9-]+$/ },
    descripcion: { type: String, trim: true, default: '' },
    orden: { type: Number, default: 0 },
    activo: { type: Boolean, default: true },
    videos: [{ type: Schema.Types.ObjectId, ref: 'Video' }],
    competencias: [{ type: Schema.Types.ObjectId, ref: 'Competencia' }],
  },
  { timestamps: true },
);

export default mongoose.models.CanalTv || mongoose.model('CanalTv', CanalTvSchema);
