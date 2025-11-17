import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import logger from './src/utils/logger.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import { requestLogger } from './src/middleware/requestLogger.js';

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
    path.join(__dirname, 'src/routes/**/*.js'),
    path.join(__dirname, 'src/models/**/*.js'),
    path.join(__dirname, 'swagger/schemas/**/*.yaml'),
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
import usuariosRoutes from './src/routes/usuarios.js';
import authRoutes from './src/routes/auth.js';

import equiposRoutes from './src/routes/Equipos/equipos.js';
import equiposCompetenciaRoutes from './src/routes/Equipos/equiposCompetencia.js';
import participacionTemporadaRoutes from './src/routes/Equipos/participacionTemporada.js';
import participacionFaseRoutes from './src/routes/Equipos/participacionFase.js';
import equipoPartidoRoutes from './src/routes/Equipos/equipoPartido.js';

import jugadoresRoutes from './src/routes/Jugadores/jugadores.js';
import jugadorEquipoRoutes from './src/routes/Jugadores/jugadorEquipo.js';  
import jugadorCompetenciaRoutes from './src/routes/Jugadores/jugadorCompetencia.js';
import jugadorTemporadaRoutes from './src/routes/Jugadores/jugadorTemporada.js';
import jugadorFaseRoutes from './src/routes/Jugadores/jugadorFase.js';
import jugadorPartidoRoutes from './src/routes/Jugadores/jugadorPartido.js';

import partidosRoutes from './src/routes/partidos.js';
import setPartidoRoutes from './src/routes/setPartido.js';
import estadisticasRoutes from './src/routes/estadisticas.js';
import estadisticasJugadorPartidoRoutes from './src/routes/Jugadores/estadisticasJugadorPartido.js';
import estadisticasJugadorSetRoutes from './src/routes/Jugadores/estadisticasJugadorSet.js';
import estadisticasJugadorPartidoManualRoutes from './src/routes/Jugadores/estadisticasJugadorPartidoManual.js';
import estadisticasEquipoPartidoRoutes from './src/routes/Equipos/estadisticasEquipoPartido.js';

import organizacionesRoutes from './src/routes/organizaciones.js';
import competenciasRoutes from './src/routes/Competencias/competencias.js';
import fasesRoutes from "./src/routes/Competencias/fases.js";
import temporadasRoutes from './src/routes/Competencias/temporadas.js';
import solicitudesEdicionRoutes from './src/routes/solicitudEdicion.js';


dotenv.config(); // inicializar dotenv

const app = express();

// Security Middleware
app.use(helmet());

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: 'Too many failed login attempts, please try again later',
});

app.use('/api/', limiter);

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
  'https://overtime-organizaciones.vercel.app/',
  'https://overtime-admin.vercel.app',
  'https://overtime-admin.vercel.app/'
    
  // Agregar con barra al final por si acaso
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

// Request logging middleware
app.use(requestLogger);

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
app.use('/api/auth', loginLimiter, authRoutes);
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

// Error Handler (siempre al final)
app.use(errorHandler);

// Create logs directory if it doesn't exist
import fs from 'fs';
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Servidor corriendo en http://localhost:${PORT}`);
});
