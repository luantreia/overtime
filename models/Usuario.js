// models/Usuario.js
import mongoose from 'mongoose';


const usuarioSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UID Firebase como _id
  email: { type: String, required: true },
  nombre: { type: String, required: true },
  rol: { type: String, enum: ["lector", "editor", "admin"], default: "lector" },
});

export default mongoose.model("Usuario", usuarioSchema);
