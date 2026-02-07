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
import CameraManager from './src/services/CameraManager.js';
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
import rankedRouter from './src/routes/ranked.js';
import dashboardRoutes from './src/routes/dashboard.js';


dotenv.config(); // inicializar dotenv

const app = express();
// Trust proxy (Render/NGINX) so rate-limit can read X-Forwarded-For safely
app.set('trust proxy', 1);

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

// Ensure MatchPlayer index matches triple-scope uniqueness
mongoose.connection.once('open', async () => {
  try {
    const collection = mongoose.connection.collection('matchplayers');
    const indexes = await collection.indexes();
    const hasOld = indexes.some(i => i.name === 'partidoId_1_playerId_1_temporadaId_1');
    if (hasOld) {
      await collection.dropIndex('partidoId_1_playerId_1_temporadaId_1');
      console.log('[DB] Dropped old MatchPlayer index partidoId_1_playerId_1_temporadaId_1');
    }
    const hasNew = indexes.some(i => i.name === 'partidoId_1_playerId_1_temporadaId_1_competenciaId_1');
    if (!hasNew) {
      await collection.createIndex(
        { partidoId: 1, playerId: 1, temporadaId: 1, competenciaId: 1 },
        { unique: true }
      );
      console.log('[DB] Created MatchPlayer index partidoId_1_playerId_1_temporadaId_1_competenciaId_1');
    }
  } catch (err) {
    console.error('[DB] MatchPlayer index migration failed:', err?.message || err);
  }
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
  // DT Panel 
  'https://overtime-dt.vercel.app',
  'https://overtime-dt.vercel.app/',
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
  // Partido Panel
  'https://overtime-partido.vercel.app',
  'https://overtime-partido.vercel.app/',
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
app.use('/api/ranked', rankedRouter);
app.use('/api/dashboard', dashboardRoutes);


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

// Initialize CameraManager
CameraManager.initialize(io);

// In-memory storage for throttling DB saves
const matchSaveThrottles = {};

io.on('connection', (socket) => {
  logger.info(`New client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
    // Handle camera/compositor disconnect
    CameraManager.handleDisconnect(socket.id);
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

  // Configuración de Overlay
  socket.on('overlay:config', (data) => {
    // data: { matchId, showSetTimer: boolean }
    io.to(data.matchId).emit('overlay:config', data);
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
              case 'PAUSE_SET_ONLY':
                  await TimerManager.pauseSetOnly(matchId);
                  break;
              case 'RESET_ALL':
                  await TimerManager.resetAll(matchId);
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

  // ==================== CAMERA EVENTS (WebRTC Multi-Camera System) ====================

  // Camera source joins a match
  socket.on('camera:join', (data) => {
    // data: { matchId, slot, label }
    const { matchId, slot, label } = data;
    socket.join(matchId);
    logger.info(`Camera ${slot} joining match ${matchId}`);
    
    const result = CameraManager.registerCamera(socket.id, matchId, slot, label);
    socket.emit('camera:join_result', result);
  });

  // Camera source leaves
  socket.on('camera:leave', () => {
    CameraManager.unregisterCamera(socket.id);
  });

  // Camera status update (connecting, live, error)
  socket.on('camera:status', (data) => {
    // data: { status: 'connecting' | 'live' | 'error' }
    CameraManager.updateCameraStatus(socket.id, data.status);
  });

  // Camera quality change
  socket.on('camera:quality', (data) => {
    // data: { quality: 'low' | 'medium' | 'high' }
    CameraManager.updateCameraQuality(socket.id, data.quality);
  });

  // Compositor joins a match
  socket.on('camera:compositor_join', (data) => {
    // data: { matchId }
    const { matchId } = data;
    socket.join(matchId);
    logger.info(`Compositor joining match ${matchId}`);
    
    const result = CameraManager.registerCompositor(socket.id, matchId);
    socket.emit('camera:compositor_join_result', result);
  });

  // Program viewer join (overlay or other viewers request the composed program stream)
  socket.on('program:viewer_join', (data) => {
    // data: { matchId }
    logger.info(`program:viewer_join from ${socket.id} for match ${data.matchId}`);
    CameraManager.initProgramViewer(socket.id, data.matchId);
  });

  // Program offer from compositor -> relay to viewer
  socket.on('program:offer', (data) => {
    // data: { viewerSocketId, matchId, sdp }
    logger.info(`program:offer from ${socket.id} to viewer ${data.viewerSocketId} for match ${data.matchId}`);
    CameraManager.relayProgramOffer(socket.id, data.viewerSocketId, data.matchId, data.sdp);
  });

  // Program answer from viewer -> relay to compositor
  socket.on('program:answer', (data) => {
    // data: { compositorSocketId, matchId, sdp }
    logger.info(`program:answer from ${socket.id} to compositor ${data.compositorSocketId} for match ${data.matchId}`);
    CameraManager.relayProgramAnswer(socket.id, data.compositorSocketId, data.matchId, data.sdp);
  });

  // Program ICE candidate (either direction) - data: { targetSocketId, matchId, candidate }
  socket.on('program:ice', (data) => {
    logger.info(`program:ice from ${socket.id} to ${data.targetSocketId} for match ${data.matchId}`);
    CameraManager.relayProgramIce(socket.id, data.targetSocketId, data.matchId, data.candidate);
  });

  // Switch active camera
  socket.on('camera:switch', (data) => {
    // data: { matchId, slot }
    const { matchId, slot } = data;
    logger.info(`Switching to camera ${slot} for match ${matchId}`);
    
    const result = CameraManager.switchActiveCamera(matchId, slot);
    if (!result.success) {
      socket.emit('camera:error', { message: result.error });
    }
  });

  // Request current camera state
  socket.on('camera:request_state', (data) => {
    // data: { matchId }
    CameraManager.emitCameraState(data.matchId);
  });

  // WebRTC Signaling: Offer from camera to compositor
  socket.on('camera:offer', (data) => {
    // data: { matchId, slot, sdp }
    const { matchId, slot, sdp } = data;
    CameraManager.relayOffer(socket.id, matchId, slot, sdp);
  });

  // WebRTC Signaling: Answer from compositor to camera
  socket.on('camera:answer', (data) => {
    // data: { matchId, slot, sdp }
    const { matchId, slot, sdp } = data;
    CameraManager.relayAnswer(socket.id, matchId, slot, sdp);
  });

  // WebRTC Signaling: ICE candidate exchange
  socket.on('camera:ice', (data) => {
    // data: { matchId, slot, candidate }
    const { matchId, slot, candidate } = data;
    CameraManager.relayIceCandidate(socket.id, matchId, slot, candidate);
  });
});

// Make io accessible in routes if needed (e.g. via req.app.get('io'))
app.set('io', io);

httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info(`Servidor corriendo en http://localhost:${PORT}`);
});
