import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * TokenUsuario — tokens de un solo uso para flujos de cuenta (reset de contraseña
 * y verificación de email). Se guarda solo el hash, igual que InvitacionJugador:
 * el valor en claro viaja al usuario por mail y no queda en la base.
 */
const tokenUsuarioSchema = new Schema({
  usuario: { type: String, ref: 'Usuario', required: true, index: true },

  tipo: {
    type: String,
    enum: ['reset-password', 'verificacion-email'],
    required: true,
    index: true,
  },

  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

// Los tokens vencidos se limpian solos.
tokenUsuarioSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model('TokenUsuario', tokenUsuarioSchema);
