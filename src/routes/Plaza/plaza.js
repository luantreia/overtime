import express from 'express';
import Lobby from '../../models/Plaza/Lobby.js';
import KarmaLog from '../../models/Plaza/KarmaLog.js';
import Jugador from '../../models/Jugador/Jugador.js';
import PlayerRating from '../../models/Jugador/PlayerRating.js';
import Partido from '../../models/Partido/Partido.js';
import MatchTeam from '../../models/Partido/MatchTeam.js';
import { applyRankedResult } from '../../services/ratingService.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Plaza
 *   description: Lobbies y partidos callejeros (La Plaza)
 */

/**
 * @swagger
 * /api/plaza/lobbies:
 *   get:
 *     summary: Obtiene los lobbies activos
 *     tags: [Plaza]
 */
router.get('/lobbies', async (req, res) => {
  try {
    const lobbies = await Lobby.find({ status: { $in: ['open', 'full', 'playing'] } })
      .populate('players.player', 'nombre alias foto')
      .sort({ scheduledDate: 1 });
    res.json(lobbies);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener lobbies', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies:
 *   post:
 *     summary: Crea un nuevo lobby
 *     tags: [Plaza]
 */
router.post('/lobbies', verificarToken, async (req, res) => {
  try {
    const { title, description, modalidad, categoria, location, scheduledDate, maxPlayers, requireOfficial, genderPolicy } = req.body;
    
    // Buscar si el host tiene perfil de jugador para auto-unirse
    const jugador = await Jugador.findOne({ userId: req.user.uid });

    if (!jugador) {
      return res.status(403).json({ message: 'Debes tener un perfil de jugador vinculado para crear lobbies en La Plaza.' });
    }

    const lobby = new Lobby({
      host: req.user.uid,
      title,
      description,
      modalidad,
      categoria,
      location,
      scheduledDate: new Date(scheduledDate),
      maxPlayers: maxPlayers || 12,
      requireOfficial,
      genderPolicy,
      players: [{
        player: jugador._id,
        userUid: req.user.uid,
        team: 'none',
        joinedAt: new Date(),
        confirmed: false
      }]
    });

    await lobby.save();
    res.status(201).json(lobby);
  } catch (error) {
    res.status(400).json({ message: 'Error al crear lobby', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}:
 *   get:
 *     summary: Obtiene el detalle de un lobby
 *     tags: [Plaza]
 */
router.get('/lobbies/:id', validarObjectId, async (req, res) => {
  try {
    const lobby = await Lobby.findById(req.params.id)
      .populate('players.player', 'nombre alias foto elo');
    
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });
    res.json(lobby);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener lobby', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/join:
 *   post:
 *     summary: Unirse a un bloque como Jugador
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/join', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { team = 'none' } = req.body;
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });
    
    if (lobby.status !== 'open' && lobby.status !== 'full') {
      return res.status(400).json({ message: 'Este lobby ya no acepta nuevos jugadores' });
    }

    // Buscar el perfil de jugador del usuario
    const jugador = await Jugador.findOne({ userId: req.user.uid });
    if (!jugador) {
      return res.status(400).json({ message: 'Aún no tienes un perfil de jugador vinculado. Ve a tu perfil para reclamar uno.' });
    }

    // Verificar si ya está unido
    const yaUnido = lobby.players.some(p => p.player.toString() === jugador._id.toString());
    if (yaUnido) {
      return res.status(400).json({ message: 'Ya estás en este lobby' });
    }

    // Validar cupos por equipo (Max 9 por bando: 6 en cancha + 3 shaggers/reservas)
    if (team !== 'none') {
      const countInTeam = lobby.players.filter(p => p.team === team).length;
      if (countInTeam >= 9) {
        return res.status(400).json({ message: `El equipo ${team} ya tiene sus 9 cupos (jugadores y shaggers) llenos.` });
      }
    }

    // Validar cupo total (Max 18)
    if (lobby.players.length >= 18) {
      return res.status(400).json({ message: 'El lobby ya tiene el máximo de 18 jugadores.' });
    }

    lobby.players.push({
      player: jugador._id,
      userUid: req.user.uid,
      team,
      joinedAt: new Date()
    });

    await lobby.save();
    res.json({ message: 'Te has unido al lobby exitosamente', lobby });
  } catch (error) {
    res.status(500).json({ message: 'Error al unirse al lobby', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/join-official:
 *   post:
 *     summary: Unirse como Árbitro o Juez de Línea
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/join-official', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { type } = req.body; // 'principal', 'secundario', 'linea'
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    // Buscar el perfil de jugador (para tener identidad)
    const jugador = await Jugador.findOne({ userId: req.user.uid });
    if (!jugador) {
      return res.status(400).json({ message: 'Debes tener un perfil de jugador para oficiales.' });
    }

    // Validar si ya es oficial
    if (lobby.officials.some(o => o.userUid === req.user.uid)) {
      return res.status(400).json({ message: 'Ya eres oficial en este lobby' });
    }

    // Validar cupos de oficiales
    if (type === 'principal' && lobby.officials.some(o => o.type === 'principal')) {
      return res.status(400).json({ message: 'Ya hay un árbitro principal' });
    }
    if (type === 'secundario' && lobby.officials.some(o => o.type === 'secundario')) {
      return res.status(400).json({ message: 'Ya hay un segundo árbitro' });
    }
    const lineasCount = lobby.officials.filter(o => o.type === 'linea').length;
    if (type === 'linea' && lineasCount >= 4) {
      return res.status(400).json({ message: 'Ya hay 4 jueces de línea' });
    }

    lobby.officials.push({
      player: jugador._id,
      userUid: req.user.uid,
      type,
      confirmed: false
    });

    await lobby.save();
    res.json({ message: `Te has unido como oficial (${type})`, lobby });
  } catch (error) {
    res.status(500).json({ message: 'Error al unirse como oficial', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/balance-teams:
 *   post:
 *     summary: Balancea los equipos del lobby equitativamente según el ELO (Auto-Balanceo)
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/balance-teams', verificarToken, validarObjectId, async (req, res) => {
  try {
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    // Solo el host o un admin puede balancear
    if (lobby.host !== req.user.uid && req.user.rol !== 'admin') {
      return res.status(403).json({ message: 'No tienes permiso para balancear los equipos de este lobby' });
    }

    if (lobby.players.length < 2) {
      return res.status(400).json({ message: 'Se necesitan al menos 2 jugadores para balancear equipos' });
    }

    // 1. Obtener los ratings de todos los jugadores (Level 1 - Global)
    const playerIds = lobby.players.map(p => p.player);
    const ratings = await PlayerRating.find({
      playerId: { $in: playerIds },
      competenciaId: null, // Global Master
      modalidad: lobby.modalidad
    });

    const ratingMap = ratings.reduce((acc, curr) => {
      acc[curr.playerId.toString()] = curr.rating;
      return acc;
    }, {});

    // 2. Crear lista de jugadores con su ELO (default 0 para unranked)
    const sortedPlayers = lobby.players.map(p => ({
      _id: p._id,
      player: p.player,
      elo: ratingMap[p.player.toString()] || 0
    })).sort((a, b) => b.elo - a.elo); // Descendente

    // 3. Repartir equitativamente (Algoritmo Greedy)
    let totalEloA = 0;
    let totalEloB = 0;
    let countA = 0;
    let countB = 0;
    const maxPerTeam = 9;

    for (const p of sortedPlayers) {
      const targetLobbyPlayer = lobby.players.id(p._id);
      
      // Decisión: ¿A o B? 
      // Si un equipo está lleno, va al otro. Si no, al que tenga menos ELO acumulado.
      if (countA < maxPerTeam && (countB >= maxPerTeam || totalEloA <= totalEloB)) {
        targetLobbyPlayer.team = 'A';
        totalEloA += p.elo;
        countA++;
      } else if (countB < maxPerTeam) {
        targetLobbyPlayer.team = 'B';
        totalEloB += p.elo;
        countB++;
      } else {
        // Por si acaso hay más de 18 (no debería pasar por las validaciones de join)
        targetLobbyPlayer.team = 'none';
      }
    }

    lobby.updatedAt = new Date();
    await lobby.save();

    res.json({
      message: 'Equipos balanceados equitativamente',
      averages: {
        teamA: Math.round(totalEloA / (countA || 1)),
        teamB: Math.round(totalEloB / (countB || 1))
      },
      lobby
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al balancear equipos', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/check-in:
 *   post:
 *     summary: Confirma asistencia mediante GPS (Geofencing)
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/check-in', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { lat, lng } = req.body; // Coordenadas enviadas por el móvil
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    if (!lat || !lng) {
      return res.status(400).json({ message: 'Se requieren coordenadas GPS para confirmar asistencia.' });
    }

    // 1. Buscar al jugador en el lobby
    const playerEntry = lobby.players.find(p => p.userUid === req.user.uid);
    if (!playerEntry) {
      return res.status(403).json({ message: 'No eres parte de este lobby.' });
    }

    // 2. Calcular distancia (Haversine Formula)
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = toRad(lobby.location.coordinates.lat);
    const φ2 = toRad(lat);
    const Δφ = toRad(lat - lobby.location.coordinates.lat);
    const Δλ = toRad(lng - lobby.location.coordinates.lng);

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distancia en metros

    const MAX_DISTANCE = 150; // 150 metros de margen de error GPS

    if (distance > MAX_DISTANCE) {
      return res.status(400).json({ 
        message: `Estás demasiado lejos del punto de encuentro (${Math.round(distance)}m). Debes estar a menos de ${MAX_DISTANCE}m.`,
        distance: Math.round(distance)
      });
    }

    // 3. Confirmar asistencia
    playerEntry.confirmed = true;
    playerEntry.isAFK = false; // Por si acaso estaba marcado como AFK
    await lobby.save();

    res.json({ 
      message: 'Asistencia confirmada exitosamente. ¡A jugar!',
      distance: Math.round(distance)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al confirmar asistencia', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/start:
 *   post:
 *     summary: Inicia el partido oficialmente y designa Capitán Rival por Karma
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/start', verificarToken, validarObjectId, async (req, res) => {
  try {
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    // Solo el host puede iniciar
    if (lobby.host !== req.user.uid) {
      return res.status(403).json({ message: 'Solo el Host puede iniciar el partido' });
    }

    // 1. Validar que haya jugadores confirmados en ambos equipos
    const confirmedA = lobby.players.filter(p => p.team === 'A' && p.confirmed);
    const confirmedB = lobby.players.filter(p => p.team === 'B' && p.confirmed);

    if (confirmedA.length < 1 || confirmedB.length < 1) {
      return res.status(400).json({ message: 'Se necesita al menos un jugador confirmado en cada equipo para iniciar.' });
    }

    // 2. Calcular Karma para los confirmados del Equipo B para elegir Capitán
    // Agregamos Karma por targetPlayer
    const playerIdsB = confirmedB.map(p => p.player);
    const karmaStats = await KarmaLog.aggregate([
      { $match: { targetPlayer: { $in: playerIdsB } } },
      { $group: { _id: '$targetPlayer', totalKarma: { $sum: '$points' } } }
    ]);

    const karmaMap = karmaStats.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr.totalKarma;
      return acc;
    }, {});

    // Elegir el de mayor Karma (por defecto 0 si no tienen logs)
    let bestKarma = -Infinity;
    let captainUid = confirmedB[0].userUid;

    for (const p of confirmedB) {
      const pKarma = karmaMap[p.player.toString()] || 0;
      if (pKarma > bestKarma) {
        bestKarma = pKarma;
        captainUid = p.userUid;
      }
    }

    lobby.rivalCaptainUid = captainUid;
    lobby.status = 'playing';
    
    // Marcar como AFK a los que no confirmaron antes de iniciar
    lobby.players.forEach(p => {
      if (!p.confirmed) p.isAFK = true;
    });

    await lobby.save();

    res.json({ 
      message: 'Partido iniciado. ¡Buena suerte!', 
      rivalCaptainUid: captainUid,
      lobby 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar partido', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/leave:
 *   post:
 *     summary: Salir de un lobby
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/leave', verificarToken, validarObjectId, async (req, res) => {
  try {
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    if (lobby.status === 'playing' || lobby.status === 'finished') {
      return res.status(400).json({ message: 'No puedes salir de un partido que ya está en curso o finalizado' });
    }

    const initialLength = lobby.players.length;
    lobby.players = lobby.players.filter(p => p.userUid !== req.user.uid);

    if (lobby.players.length === initialLength) {
      return res.status(400).json({ message: 'No eres parte de este lobby' });
    }

    // Si el host se va y no hay más jugadores, tal vez cancelar?
    // O simplemente dejar que otro sea host? Por ahora solo quitamos.
    if (lobby.host === req.user.uid && lobby.players.length > 0) {
      lobby.host = lobby.players[0].userUid; // Transfer host to next player
    }

    await lobby.save();
    res.json({ message: 'Has salido del lobby', lobby });
  } catch (error) {
    res.status(500).json({ message: 'Error al salir del lobby', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/result:
 *   post:
 *     summary: Carga el resultado del partido de plaza (Inicia el consenso)
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/result', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { scoreA, scoreB } = req.body;
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    // Autoridades permitidas para iniciar carga: Host o Árbitro Principal
    const isHost = lobby.host === req.user.uid;
    const isPrincipalOfficial = lobby.officials.some(o => o.userUid === req.user.uid && o.type === 'principal');

    if (!isHost && !isPrincipalOfficial) {
      return res.status(403).json({ message: 'Solo el Host o el Árbitro Principal pueden iniciar la carga de resultados' });
    }

    lobby.result = {
      scoreA,
      scoreB,
      submittedBy: req.user.uid,
      confirmedByOpponent: false,
      validatedByOfficial: isPrincipalOfficial, // Si lo sube el árbitro, ya cuenta como validado por él
      disputed: false
    };
    
    // Si lo sube el host, queda pendiente de confirmación del árbitro o del capitán rival
    await lobby.save();

    res.json({ message: 'Resultado cargado. Esperando consenso de otra autoridad.', lobby });
  } catch (error) {
    res.status(500).json({ message: 'Error al cargar resultado', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/confirm:
 *   post:
 *     summary: Confirma el resultado cargado (Sistema de Consenso 2 de 3)
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/confirm', verificarToken, validarObjectId, async (req, res) => {
  try {
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    if (!lobby.result.submittedBy) {
      return res.status(400).json({ message: 'No hay resultados pendientes de confirmación' });
    }

    if (lobby.result.submittedBy === req.user.uid) {
      return res.status(400).json({ message: 'No puedes confirmar tu propio resultado. Otra autoridad debe validarlo.' });
    }

    // Quién está intentando confirmar?
    const isHost = lobby.host === req.user.uid;
    const isPrincipalOfficial = lobby.officials.some(o => o.userUid === req.user.uid && o.type === 'principal');
    const isRivalCaptain = lobby.rivalCaptainUid === req.user.uid;

    // Consenso: Solo puede confirmar el Host, el Árbitro o el Capitán Rival (B)
    if (!isHost && !isPrincipalOfficial && !isRivalCaptain) {
      return res.status(403).json({ message: 'Solo el Host, el Árbitro Principal o el Capitán Rival pueden confirmar este resultado' });
    }

    // Actualizar estados de validación
    if (isPrincipalOfficial) lobby.result.validatedByOfficial = true;
    if (isRivalCaptain || (isHost && lobby.result.submittedBy !== req.user.uid)) {
      lobby.result.confirmedByOpponent = true;
    }

    lobby.status = 'finished';
    
    // --- INTEGRACIÓN CON RANKING (EXPANSIÓN GLOBAL) ---
    // 1. Crear el Partido oficial en la base de datos
    const teamAPlayers = lobby.players.filter(p => p.team === 'A').map(p => p.player);
    const teamBPlayers = lobby.players.filter(p => p.team === 'B').map(p => p.player);
    const afkPlayers = lobby.players.filter(p => !p.confirmed).map(p => p.player);

    const match = await Partido.create({
      modalidad: lobby.modalidad,
      categoria: lobby.categoria,
      fecha: lobby.scheduledDate,
      creadoPor: lobby.host,
      estado: 'finalizado',
      marcadorLocal: lobby.result.scoreA,
      marcadorVisitante: lobby.result.scoreB,
      isRanked: true,
      rankedMeta: {
        applied: true,
        modalidad: lobby.modalidad,
        categoria: lobby.categoria,
        teamColors: { local: 'rojo', visitante: 'azul' },
        afkPlayers
      }
    });

    // 2. Crear los registros de MatchTeam (Necesarios para el ratingService)
    await MatchTeam.create([
      { partidoId: match._id, color: 'rojo', players: teamAPlayers },
      { partidoId: match._id, color: 'azul', players: teamBPlayers }
    ]);

    // 3. Calcular y aplicar el ELO con multiplicador de Plaza
    // Multiplicador: 0.5 si hay árbitro principal validando, 0.3 si es solo entre capitanes.
    const multiplier = lobby.result.validatedByOfficial ? 0.5 : 0.3;
    const winner = lobby.result.scoreA > lobby.result.scoreB ? 'rojo' : 
                   (lobby.result.scoreA < lobby.result.scoreB ? 'azul' : 'empate');

    await applyRankedResult({
      partidoId: match._id,
      competenciaId: null, // Ranking Global Maestro (Nivel 1)
      temporadaId: null,
      modalidad: lobby.modalidad,
      categoria: lobby.categoria,
      result: winner,
      afkPlayerIds: afkPlayers.map(id => id.toString()),
      multiplier: multiplier
    });

    lobby.matchId = match._id;
    await lobby.save();

    res.json({ message: 'Consenso alcanzado. El partido de plaza ha sido finalizado y el ELO ha sido aplicado.', lobby, matchId: match._id });
  } catch (error) {
    res.status(500).json({ message: 'Error al confirmar resultado', error: error.message });
  }
});

export default router;
