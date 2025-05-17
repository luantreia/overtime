const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const bodyParser = require('body-parser');
const usuariosRoutes = require('./routes/usuarios');
const equiposRoutes = require('./routes/equipos');
const jugadoresRoutes = require('./routes/jugadores');


// Conectar a la base de datos de MongoDB usando Mongoose
mongoose.connect(process.env.MONGO_URI, {
  dbName: "test"
})
  .then(() => {
    console.log('Conexión a MongoDB exitosa!');
  })
  .catch((error) => {
    console.error('Error al conectar a MongoDB:', error);
  });

// Middleware
// Configurar CORS para aceptar solicitudes desde cualquier origen
app.use(cors({
  origin: 'http://localhost:3000',  // Permite solicitudes desde el frontend
  methods: 'GET,POST,PUT,DELETE',  // Métodos permitidos
  allowedHeaders: 'Content-Type,Authorization',  // Encabezados permitidos
}));

app.use(express.json());

  // Rutas
app.use('/api/equipos', equiposRoutes);
app.use('/api/jugadores', jugadoresRoutes);
app.use('/api/usuarios', usuariosRoutes);

// Definir puerto del servidor
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
