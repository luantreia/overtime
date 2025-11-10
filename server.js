import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Overtime API',
      version: '1.0.0',
      description: 'Documentation for Overtime API',
      contact: {
        name: 'API Support',
        email: 'support@overtime.com',
      },
    },
    servers: [
      {
        url: 'https://overtime-ddyl.onrender.com',
        description: 'Production server',
      },
      {
        url: process.env.API_BASE_URL || 'http://localhost:5000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    path.join(__dirname, 'routes/**/*.js'),
    path.join(__dirname, 'models/**/*.js'),
    path.join(__dirname, 'swagger/schemas/**/*.yaml'),
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
import usuariosRoutes from './routes/usuarios.js';
import authRoutes from './routes/auth.js';

import equiposRoutes from './routes/Equipos/equipos.js';
import equiposCompetenciaRoutes from './routes/Equipos/equiposCompetencia.js';
import participacionTemporadaRoutes from './routes/Equipos/participacionTemporada.js';
import participacionFaseRoutes from './routes/Equipos/participacionFase.js';
import equipoPartidoRoutes from './routes/Equipos/equipoPartido.js'; // asegurate de importar el modelo

import jugadoresRoutes from './routes/Jugadores/jugadores.js';
import jugadorEquipoRoutes from './routes/Jugadores/jugadorEquipo.js';  
import jugadorCompetenciaRoutes from './routes/Jugadores/jugadorCompetencia.js';
import jugadorTemporadaRoutes from './routes/Jugadores/jugadorTemporada.js';
import jugadorFaseRoutes from './routes/Jugadores/jugadorFase.js';
import jugadorPartidoRoutes from './routes/Jugadores/jugadorPartido.js';

import partidosRoutes from './routes/partidos.js';
import setPartidoRoutes from './routes/setPartido.js';
import estadisticasRoutes from './routes/estadisticas.js';
import estadisticasJugadorPartidoRoutes from './routes/Jugadores/estadisticasJugadorPartido.js';
import estadisticasJugadorSetRoutes from './routes/Jugadores/estadisticasJugadorSet.js';
import estadisticasJugadorPartidoManualRoutes from './routes/Jugadores/estadisticasJugadorPartidoManual.js';
import estadisticasEquipoPartidoRoutes from './routes/Equipos/estadisticasEquipoPartido.js';

import organizacionesRoutes from './routes/organizaciones.js';
import competenciasRoutes from './routes/Competencias/competencias.js';
import fasesRoutes from "./routes/Competencias/fases.js";
import temporadasRoutes from './routes/Competencias/temporadas.js';
import solicitudesEdicionRoutes from './routes/solicitudEdicion.js';


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
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'https://overtime-dodgeball.vercel.app',
  'https://overtime-dodgeball.vercel.app/',
  'https://dodgeballmanager.vercel.app',
  'https://dodgeballmanager.vercel.app/',
  'https://overtime-manager.vercel.app',
  'https://overtime-manager.vercel.app/',
  'https://overtime-organizaciones.vercel.app',
  'https://overtime-organizaciones.vercel.app/' // Agregar con barra al final por si acaso
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

// Serve Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Overtime API Documentation',
  customfavIcon: '/favicon.ico',
}));

// Add route to serve the raw JSON spec
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);

app.use('/api/equipos', equiposRoutes);
app.use('/api/equipos-competencia', equiposCompetenciaRoutes);
app.use('/api/participacion-temporada', participacionTemporadaRoutes);
app.use('/api/participacion-fase', participacionFaseRoutes);
app.use('/api/equipo-partido', equipoPartidoRoutes); // Asegúrate de que este modelo esté correctamente definido

app.use('/api/jugadores', jugadoresRoutes);
app.use('/api/jugador-equipo', jugadorEquipoRoutes);
app.use('/api/jugador-competencia', jugadorCompetenciaRoutes);
app.use('/api/jugador-temporada', jugadorTemporadaRoutes);
app.use('/api/jugador-fase', jugadorFaseRoutes);
app.use('/api/jugador-partido', jugadorPartidoRoutes);

app.use('/api/partidos', partidosRoutes);
app.use('/api/set-partido', setPartidoRoutes);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/estadisticas/jugador-partido', estadisticasJugadorPartidoRoutes);
app.use('/api/estadisticas/jugador-partido-manual', estadisticasJugadorPartidoManualRoutes);
app.use('/api/estadisticas/jugador-set', estadisticasJugadorSetRoutes);
app.use('/api/estadisticas/equipo-partido', estadisticasEquipoPartidoRoutes);

app.use('/api/organizaciones', organizacionesRoutes);
app.use('/api/competencias', competenciasRoutes);
app.use('/api/temporadas', temporadasRoutes);
app.use('/api/fases', fasesRoutes);
app.use('/api/solicitudes-edicion', solicitudesEdicionRoutes);


app.get('/api/ping', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// Definir puerto del servidor
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
