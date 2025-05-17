// models/Usuario.js
const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  rol: { type: String, enum: ["lector", "editor", "admin"], default: "lector" },
});

module.exports = mongoose.model("Usuario", usuarioSchema);
