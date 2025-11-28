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
import { createServer } from 'http';
import { Server } from 'socket.io';
import Partido from './src/models/Partido/Partido.js';
import SetPartido from './src/models/Partido/SetPartido.js';
import { computeRemainingFromDoc, computeSuddenDeathFromDoc } from './src/utils/timerUtils.js';

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
        url: 'https://overtime-ddyl.onrender.com/api',
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

let swaggerSpec;
try {
  swaggerSpec = swaggerJSDoc(swaggerOptions);
} catch (err) {
  console.error('[Swagger] Failed to generate spec from JSDoc/YAML. Continuing without full docs.', err?.message || err);
  swaggerSpec = {
    openapi: '3.0.0',
    info: {
      title: 'Overtime API',
      version: '1.0.0',
      description: 'Swagger generation failed. Docs are disabled for now.'
    },
    servers: [
      { url: process.env.API_BASE_URL || 'http://localhost:5000', description: 'Development server' }
    ],
    paths: {}
  };
}
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
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 2000, // Limit each IP to 1000 requests per windowMs
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
  // Public Page
  'https://overtime-public.vercel.app',
  'https://overtime-public.vercel.app/',
  // Manager Panel
  'https://overtime-manager.vercel.app',
  'https://overtime-manager.vercel.app/',
  // DT Panel (nombre viejo: dodgeballmanager)
  'https://dodgeballmanager.vercel.app',
  'https://dodgeballmanager.vercel.app/',
  // Admin Panel
  'https://overtime-admin.vercel.app',
  'https://overtime-admin.vercel.app/',
  // Organizaciones Panel
  'https://overtime-organizaciones.vercel.app',
  'https://overtime-organizaciones.vercel.app/',
  // Legacy
  'https://overtime-dodgeball.vercel.app',
  'https://overtime-dodgeball.vercel.app/',
  // Backend (Render)
  'https://overtime-ddyl.onrender.com',
  'https://overtime-ddyl.onrender.com/',
];

app.use(cors({
  origin: function(origin, callback) {
    // Permite solicitudes sin origen (como Postman o backend a backend)
    if (!origin) return callback(null, true);
    // Permite cualquier origen localhost para desarrollo
    if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
      return callback(null, true);
    }
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


// Public configuration endpoint for clients (feature flags, model info)
app.get('/api/config', (req, res) => {
  const enableGpt5 = process.env.ENABLE_GPT5 === 'true' || process.env.ENABLE_GPT5 === undefined;
  const model = process.env.GPT_MODEL || 'gpt-5';
  res.status(200).json({ features: { enableGpt5 }, model });
});


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

import TimerManager from './src/services/TimerManager.js';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for now, configure for production
    methods: ["GET", "POST"]
  }
});

// Initialize TimerManager
TimerManager.initialize(io);

// In-memory storage for throttling DB saves
const matchSaveThrottles = {};

io.on('connection', (socket) => {
  logger.info(`New client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });

  // Example events
  socket.on('join_match', (matchId) => {
    socket.join(matchId);
    logger.info(`Socket ${socket.id} joined match ${matchId}`);
    // Send current state immediately
    TimerManager.ensureMatchLoaded(matchId).then(() => {
        TimerManager.emitState(matchId);
    }).catch(err => console.error('Error loading match on join:', err));
  });

  // --- EVENTOS DE PARTIDO ---
  
  // Actualización del marcador (Scoreboard)
  socket.on('score:update', (data) => {
    // data: { matchId, localScore, visitorScore, setScores, ... }
    io.to(data.matchId).emit('score:updated', data);
  });

  // Control de Overlays (Mostrar/Ocultar)
  socket.on('overlay:trigger', (data) => {
    // data: { matchId, type: 'GOAL'|'LOWER'|'AD', action: 'SHOW'|'HIDE', payload: {...} }
    io.to(data.matchId).emit('overlay:triggered', data);
  });

  // --- TIMER COMMANDS (Server Authoritative) ---

  socket.on('timer:command', async (data) => {
      // data: { matchId, action, payload }
      const { matchId, action, payload } = data;
      try {
          switch (action) {
              case 'START_MATCH':
                  await TimerManager.startMatch(matchId);
                  break;
              case 'PAUSE_MATCH':
                  await TimerManager.pauseMatch(matchId);
                  break;
              case 'SET_MATCH_TIME':
                  await TimerManager.setMatchTime(matchId, payload.seconds);
                  break;
              case 'CHANGE_PERIOD':
                  await TimerManager.changePeriod(matchId, payload.period);
                  break;
              case 'START_SET':
                  await TimerManager.startSet(matchId);
                  break;
              case 'PAUSE_SET':
                  await TimerManager.pauseSet(matchId);
                  break;
              case 'SET_SET_TIME':
                  await TimerManager.setSetTime(matchId, payload.seconds);
                  break;
              case 'SET_SUDDEN_DEATH_MODE':
                  await TimerManager.setSuddenDeathMode(matchId, payload.enabled);
                  break;
              case 'START_SUDDEN_DEATH':
                  await TimerManager.startSuddenDeath(matchId);
                  break;
              case 'STOP_SUDDEN_DEATH':
                  await TimerManager.stopSuddenDeath(matchId);
                  break;
              case 'PAUSE_ALL':
                  await TimerManager.pauseAll(matchId);
                  break;
              default:
                  console.warn(`Unknown timer command: ${action}`);
          }
      } catch (err) {
          console.error(`Error processing timer command ${action}:`, err);
      }
  });

  // Client asks server for authoritative sync
  socket.on('timer:request_sync', async (matchId) => {
    try {
      await TimerManager.ensureMatchLoaded(matchId);
      TimerManager.emitState(matchId);
    } catch (err) {
      console.error('[Socket] Error in timer:request_sync', err);
    }
  });

  // Legacy sync (optional, kept for compatibility if needed)
  socket.on('timer:sync', (data) => {
    io.to(data.matchId).emit('timer:synced', data);
  });

  // Eventos de OBS (Puente)
  socket.on('obs:command', (data) => {
    // data: { matchId, command: 'SCENE_SWITCH', payload: 'Intro' }
    // Aquí podrías reenviar a un controlador OBS si estuviera conectado, 
    // o simplemente notificar a la interfaz de control.
    io.to(data.matchId).emit('obs:command_received', data);
  });
});

// Make io accessible in routes if needed (e.g. via req.app.get('io'))
app.set('io', io);

httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info(`Servidor corriendo en http://localhost:${PORT}`);
});
