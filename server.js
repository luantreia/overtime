import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import usuariosRouter from './routes/usuarios.js';
import equiposRouter from './routes/equipos.js';
import jugadoresRouter from './routes/jugadores.js';
import partidosRouter from './routes/partidos.js';
import jugadorEquipoRouter from './routes/jugadorEquipo.js';
import estadisticasRoutes from './routes/estadisticas.js';
import organizacionesRoutes from './routes/organizaciones.js';
import competenciasRoutes from './routes/competencias.js';
import equiposCompetenciaRoutes from './routes/equiposCompetencia.js';
import fasesRoutes from "./routes/fases.js"

dotenv.config(); // inicializar dotenv

const app = express();

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
const allowedOrigins = [
  'http://localhost:3000',
  'https://overtime-dodgeball.vercel.app'
];

app.use(cors({
  origin: function(origin, callback) {
    // Permite solicitudes sin origen (como Postman o backend a backend)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: 'GET,POST,PUT,DELETE',  // Métodos permitidos
  allowedHeaders: 'Content-Type,Authorization',  // Encabezados permitidos
}));

app.use(express.json());

  // Rutas
app.use('/api/equipos', equiposRouter);
app.use('/api/jugadores', jugadoresRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/partidos', partidosRouter);
app.use('/api/jugador-equipo', jugadorEquipoRouter);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/organizaciones', organizacionesRoutes);
app.use('/api/competencias', competenciasRoutes);
app.use('/api/equipos-competencia', equiposCompetenciaRoutes);
app.use('/api/fases', fasesRoutes);


app.get('/api/ping', (req, res) => {
  res.status(200).send('pong');
});

// Definir puerto del servidor
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
