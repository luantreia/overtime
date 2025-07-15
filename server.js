import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import usuariosRoutes from './routes/usuarios.js';

import equiposRoutes from './routes/Equipos/equipos.js';
import equiposCompetenciaRoutes from './routes/Equipos/equiposCompetencia.js';
import participacionTemporadaRoutes from './routes/Equipos/participacionTemporada.js';
import participacionFaseRoutes from './routes/Equipos/participacionFase.js';

import jugadoresRoutes from './routes/Jugadores/jugadores.js';
import jugadorEquipoRoutes from './routes/Jugadores/jugadorEquipo.js';  
import jugadorCompetenciaRoutes from './routes/Jugadores/jugadorCompetencia.js';
import jugadorTemporadaRoutes from './routes/Jugadores/jugadorTemporada.js';
import jugadorFaseRoutes from './routes/Jugadores/jugadorFase.js';

import partidosRoutes from './routes/partidos.js';
import setPartidoRoutes from './routes/setPartido.js';
import estadisticasRoutes from './routes/estadisticas.js';

import organizacionesRoutes from './routes/organizaciones.js';
import competenciasRoutes from './routes/Competencias/competencias.js';
import temporadasRoutes from './routes/Competencias/Temporadas.js';
import fasesRoutes from "./routes/Competencias/fases.js";



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
app.use('/api/usuarios', usuariosRoutes);

app.use('/api/equipos', equiposRoutes);
app.use('/api/equipos-competencia', equiposCompetenciaRoutes);
app.use('/api/participacion-temporada', participacionTemporadaRoutes);
app.use('/api/participacion-fase', participacionFaseRoutes);

app.use('/api/jugadores', jugadoresRoutes);
app.use('/api/jugador-equipo', jugadorEquipoRoutes);
app.use('/api/jugador-competencia', jugadorCompetenciaRoutes);
app.use('/api/jugador-temporada', jugadorTemporadaRoutes);
app.use('/api/jugador-fase', jugadorFaseRoutes);

app.use('/api/partidos', partidosRoutes);
app.use('/api/set-partido', setPartidoRoutes);
app.use('/api/estadisticas', estadisticasRoutes);

app.use('/api/organizaciones', organizacionesRoutes);
app.use('/api/competencias', competenciasRoutes);
app.use('/api/temporadas', temporadasRoutes);
app.use('/api/fases', fasesRoutes);


app.get('/api/ping', (req, res) => {
  res.status(200).send('pong');
});

// Definir puerto del servidor
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
