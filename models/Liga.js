import mongoose from 'mongoose';

const liga = {
  id: Number,
  nombre: String,
  temporada: String,
  fechaInicio: String,
  equipos: [Number] // ids de equipos
};
