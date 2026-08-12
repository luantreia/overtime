import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const sedeSchema = new Schema({
  nombre: { type: String, required: true, trim: true },
  direccion: { type: String, trim: true, default: '' },
  coordenadas: {
    lat: { type: Number },
    lng: { type: Number },
  },
  canchas: [{ type: String, trim: true }],

  // Dueño opcional (club/organización); no obligatorio para no bloquear sedes de terceros
  organizacion: { type: Schema.Types.ObjectId, ref: 'Organizacion', default: null },

  creadoPor: { type: String, ref: 'Usuario', required: true },
  administradores: [{ type: String, ref: 'Usuario' }],
}, { timestamps: true });

export default model('Sede', sedeSchema);
