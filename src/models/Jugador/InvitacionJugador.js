import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** InvitacionJugador — token de invitación para registrar+reclamar un perfil de jugador **/
const invitacionJugadorSchema = new Schema({
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  creadoPor: { type: String, ref: 'Usuario', required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

export default model('InvitacionJugador', invitacionJugadorSchema);
