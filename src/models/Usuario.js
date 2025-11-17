// models/Usuario.js
import mongoose from 'mongoose';


const usuarioSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UID Firebase como _id
  email: { type: String, required: true, unique: true },
  nombre: { type: String, required: true },
  rol: { type: String, enum: ["lector", "editor", "admin"], default: "lector" },
  // Para autenticación local (JWT)
  passwordHash: { type: String, select: false },
  provider: { type: String, enum: ["firebase", "local"], default: "local" },
  firebaseUid: { type: String },
});

export default mongoose.model("Usuario", usuarioSchema);
