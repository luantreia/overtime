import express from 'express';
import mongoose from 'mongoose';
import Partido from '../models/Partido/Partido.js';
import MatchTeam from '../models/Partido/MatchTeam.js';
import SetPartido from '../models/Partido/SetPartido.js';
import PlayerRating from '../models/Jugador/PlayerRating.js';
import Equipo from '../models/Equipo/Equipo.js';
import Jugador from '../models/Jugador/Jugador.js';
import { getOrCreatePlayerRating } from '../services/ratingService.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import MatchPlayer from '../models/Partido/MatchPlayer.js';
import TimerManager from '../services/TimerManager.js';

const router = express.Router();

function ensureArray(arr) { return Array.isArray(arr) ? arr : []; }

function normalizeEnum(val) {
  if (!val) return val;
  const s = val.toLowerCase().trim();
  if (s === 'foam') return 'Foam';
  if (s === 'cloth') return 'Cloth';
  if (s === 'masculino') return 'Masculino';
  if (s === 'femenino') return 'Femenino';
  if (s === 'mixto') return 'Mixto';
  if (s === 'libre') return 'Libre';
  return val;
}

async function syncJugadorPartidoFromTeams(partido, creadoPor = 'ranked-mvp') {
  if (!partido) return;
  const partidoId = (partido._id || partido).toString();
  const teams = await MatchTeam.find({ partidoId }).lean();
  if (!teams || !teams.length) return;

  const localId = partido.equipoLocal?.toString?.();
  const visitId = partido.equipoVisitante?.toString?.();
  const currentPlayers = [];
  const ops = [];

  for (const t of teams) {
    const equipo = t.color === 'rojo' ? localId : t.color === 'azul' ? visitId : undefined;
    if (!equipo) continue;
    for (const pid of (Array.isArray(t.players) ? t.players : [])) {
      const playerId = pid?.toString?.();
      if (!playerId) continue;
      currentPlayers.push(playerId);
      ops.push({
        updateOne: {
          filter: { partido: partidoId, jugador: playerId },
          update: { 
            $set: { equipo, rol: 'jugador', estado: 'aceptado', confirmoAsistencia: true },
            $setOnInsert: { creadoPor }
          },
          upsert: true,
        }
      });
    }
  }

  // Remove players no longer in teams
  await JugadorPartido.deleteMany({ partido: partidoId, jugador: { $nin: currentPlayers } });

  if (ops.length > 0) {
    try {
      await JugadorPartido.bulkWrite(ops, { ordered: false });
    } catch (e) {
      // non-fatal
    }
  }
}

async function syncMatchPlayersFromTeams(partido) {
  if (!partido) return;
  const partidoId = (partido._id || partido).toString();
  const teams = await MatchTeam.find({ partidoId }).lean();
  if (!teams || !teams.length) return;

  const modalidad = normalizeEnum(partido.rankedMeta?.modalidad || partido.modalidad);
  const categoria = normalizeEnum(partido.rankedMeta?.categoria || partido.categoria);
  const competenciaId = partido.competencia?._id || partido.competencia || null;
  const temporadaId = partido.rankedMeta?.temporadaId || partido.temporada?._id || partido.temporada || null;
  const currentPlayers = [];
  const ops = [];

  for (const t of teams) {
    const color = t.color;
    for (const pid of (Array.isArray(t.players) ? t.players : [])) {
      const playerId = pid?.toString?.();
      if (!playerId) continue;
      currentPlayers.push(playerId);
      ops.push({
        updateOne: {
          filter: { partidoId, playerId, temporadaId, competenciaId },
          update: {
            $setOnInsert: { competenciaId, temporadaId, modalidad, categoria },
            $set: { teamColor: color },
          },
          upsert: true,
        }
      });
    }
  }

  await MatchPlayer.deleteMany({ partidoId, playerId: { $nin: currentPlayers } });

  if (ops.length) {
    try {
      await MatchPlayer.bulkWrite(ops, { ordered: false });
    } catch (e) {
      console.error('[syncMatchPlayersFromTeams] bulkWrite error', e);
    }
  }
}

// Create ranked match with team assignments (cap 9 per side)
router.post('/match', async (req, res) => {
  try {
    const { competenciaId, temporadaId, modalidad: rawMod, categoria: rawCat, fecha, equipoLocal, equipoVisitante, creadoPor = 'ranked-mvp', rojoPlayers = [], azulPlayers = [], meta = {} } = req.body;
    const rojo = ensureArray(rojoPlayers);
    const azul = ensureArray(azulPlayers);
    const modalidad = normalizeEnum(rawMod);
    const categoria = normalizeEnum(rawCat);

    if (rojo.length > 9 || azul.length > 9) {
      return res.status(400).json({ ok: false, error: 'Máximo 9 jugadores por equipo' });
    }

    // Ensure placeholder teams if not provided
    let localId = equipoLocal;
    let visitanteId = equipoVisitante;
    const ensureEquipo = async (nombre) => {
      let eq = await Equipo.findOne({ nombre }).lean();
      if (!eq) {
        const nuevo = await Equipo.create({ nombre, creadoPor, administradores: [] });
        return nuevo._id;
      }
      return eq._id;
    };
    if (!localId || !mongoose.isValidObjectId(localId)) {
      localId = await ensureEquipo('Ranked Rojo');
    }
    if (!visitanteId || !mongoose.isValidObjectId(visitanteId)) {
      visitanteId = await ensureEquipo('Ranked Azul');
    }

    // Competencia is optional; set only if valid ObjectId
    const partidoPayload = {
      modalidad,
      categoria,
      fecha: fecha ? new Date(fecha) : new Date(),
      equipoLocal: localId,
      equipoVisitante: visitanteId,
      creadoPor,
      isRanked: true,
      rankedMeta: { modalidad, categoria, teamColors: { local: 'rojo', visitante: 'azul' }, temporadaId, ...meta }
    };
    if (competenciaId && mongoose.isValidObjectId(competenciaId)) {
      partidoPayload.competencia = competenciaId;
    }

    const partido = await Partido.create(partidoPayload);

    const rojoValid = rojo.filter(id => mongoose.isValidObjectId(id));
    const azulValid = azul.filter(id => mongoose.isValidObjectId(id));
    await MatchTeam.create({ partidoId: partido._id, color: 'rojo', players: rojoValid });
    await MatchTeam.create({ partidoId: partido._id, color: 'azul', players: azulValid });

    // Mirror initial assignment to JugadorPartido
    try { await syncJugadorPartidoFromTeams(partido, creadoPor); } catch (e) {}
    // Upsert placeholder MatchPlayer entries (teamColor and context)
    try { await syncMatchPlayersFromTeams(partido); } catch (e) {}

    res.status(201).json({ ok: true, partidoId: partido._id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reassign teams (cap 9 per side)
router.post('/match/:id/assign', async (req, res) => {
  try {
    const { rojoPlayers = [], azulPlayers = [] } = req.body;
    const partidoId = req.params.id;
    const rojo = ensureArray(rojoPlayers);
    const azul = ensureArray(azulPlayers);

    if (rojo.length > 9 || azul.length > 9) {
      return res.status(400).json({ ok: false, error: 'Máximo 9 jugadores por equipo' });
    }

    const rojoValid = rojo.filter(id => mongoose.isValidObjectId(id));
    const azulValid = azul.filter(id => mongoose.isValidObjectId(id));
    await MatchTeam.updateOne({ partidoId, color: 'rojo' }, { $set: { players: rojoValid } }, { upsert: true });
    await MatchTeam.updateOne({ partidoId, color: 'azul' }, { $set: { players: azulValid } }, { upsert: true });
    // Mirror to JugadorPartido so stats UI works
    try {
      const partido = await Partido.findById(partidoId);
      await syncJugadorPartidoFromTeams(partido, partido.creadoPor);
      await syncMatchPlayersFromTeams(partido);
    } catch (e) {}
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update match timer state (to sync with Mesa de Control)
router.post('/match/:id/start-timer', async (req, res) => {
  try {
    const partidoId = req.params.id;
    const { startTime, timerMatchValue = 1200 } = req.body;
    
    const update = {
      estado: 'en_juego',
      timerMatchRunning: true,
      timerMatchLastUpdate: new Date(),
      timerMatchValue,
      'rankedMeta.startTime': startTime ? new Date(startTime) : new Date()
    };

    const partido = await Partido.findByIdAndUpdate(partidoId, { $set: update }, { new: true });
    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

    // Sincronizar con el TimerManager de sockets
    try {
      await TimerManager.startMatch(partidoId);
    } catch (e) {
      console.error('[Ranked] Failed to sync TimerManager on start-timer:', e.message);
    }

    res.json({ ok: true, partido });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update match config (timers, sudden death, etc)
router.put('/match/:id/config', async (req, res) => {
  try {
    const partidoId = req.params.id;
    const { 
      matchDuration, 
      setDuration, 
      suddenDeathLimit, 
      useSuddenDeath, 
      autoPauseGlobal,
      enableCountdown,
      enableWhistle,
      voiceVolume,
      buzzerVolume,
      voiceRate,
      voiceIndex
    } = req.body;

    const update = {};
    if (typeof matchDuration === 'number') {
      update['timerMatchValue'] = matchDuration;
      update['rankedMeta.matchDuration'] = matchDuration;
    }
    if (typeof setDuration === 'number') {
      update['rankedMeta.setDuration'] = setDuration;
    }
    if (typeof suddenDeathLimit === 'number') {
      update['rankedMeta.suddenDeathLimit'] = suddenDeathLimit;
    }
    if (typeof useSuddenDeath === 'boolean') {
      update['rankedMeta.useSuddenDeath'] = useSuddenDeath;
    }
    if (typeof autoPauseGlobal === 'boolean') {
      update['rankedMeta.autoPauseGlobal'] = autoPauseGlobal;
    }

    // Audio Settings
    if (typeof enableCountdown === 'boolean') update['rankedMeta.enableCountdown'] = enableCountdown;
    if (typeof enableWhistle === 'boolean') update['rankedMeta.enableWhistle'] = enableWhistle;
    if (typeof voiceVolume === 'number') update['rankedMeta.voiceVolume'] = voiceVolume;
    if (typeof buzzerVolume === 'number') update['rankedMeta.buzzerVolume'] = buzzerVolume;
    if (typeof voiceRate === 'number') update['rankedMeta.voiceRate'] = voiceRate;
    if (typeof voiceIndex === 'number') update['rankedMeta.voiceIndex'] = voiceIndex;

    const partido = await Partido.findByIdAndUpdate(
      partidoId,
      { $set: update },
      { new: true }
    );

    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

    res.json({ ok: true, rankedMeta: partido.rankedMeta });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get match ranked detail
router.get('/match/:id', async (req, res) => {
  try {
    const partidoId = req.params.id;
    const partido = await Partido.findById(partidoId).lean();
    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    
    const [teams, players, sets] = await Promise.all([
      MatchTeam.find({ partidoId }).populate('players').lean(),
      MatchPlayer.find({ partidoId }).populate('playerId').lean(),
      SetPartido.find({ partido: partidoId }).sort('numeroSet').lean()
    ]);
    
    res.json({ ok: true, partido, teams, players, sets });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Finalize and apply rating (with playoff tie restriction)
router.post('/match/:id/finalize', async (req, res) => {
  try {
    const partidoId = req.params.id;
    const partido = await Partido.findById(partidoId);
    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    if (!partido.isRanked) return res.status(400).json({ ok: false, error: 'Partido no es ranked' });
    
    // Al finalizar o corregir, SIEMPRE intentamos revertir cualquier rastro previo para evitar duplicados
    // Incluso si applied es false, por seguridad si el estado es 'finalizado' previo.
    if (partido?.rankedMeta?.applied || partido.estado === 'finalizado') {
      const { revertRankedResult } = await import('../services/ratingService.js');
      await revertRankedResult({ partidoId });
      
      // Limpiamos los campos antes de volver a aplicar
      if (!partido.rankedMeta) partido.rankedMeta = {};
      partido.rankedMeta.applied = false;
      partido.rankedMeta.snapshot = null;
      partido.ratingDeltas = [];
    }

    // Optionally set scores from body
    const { marcadorLocal, marcadorVisitante, sets, afkPlayers = [], creadoPor = 'ranked-mvp', startTime, rojoPlayers, azulPlayers } = req.body || {};
    if (typeof marcadorLocal === 'number') {
      partido.marcadorLocal = marcadorLocal;
      partido.marcadorModificadoManualmente = true;
    }
    if (typeof marcadorVisitante === 'number') {
      partido.marcadorVisitante = marcadorVisitante;
      partido.marcadorModificadoManualmente = true;
    }

    partido.rankedMeta = partido.rankedMeta || {};

    if (startTime) {
      partido.rankedMeta.startTime = new Date(startTime);
    }
    partido.rankedMeta.endTime = new Date();

    // Optional: if teams are sent on finalize, persist them here to avoid missing rosters
    if (Array.isArray(rojoPlayers) || Array.isArray(azulPlayers)) {
      const rojo = ensureArray(rojoPlayers).filter(id => mongoose.isValidObjectId(id));
      const azul = ensureArray(azulPlayers).filter(id => mongoose.isValidObjectId(id));
      await MatchTeam.updateOne({ partidoId, color: 'rojo' }, { $set: { players: rojo } }, { upsert: true });
      await MatchTeam.updateOne({ partidoId, color: 'azul' }, { $set: { players: azul } }, { upsert: true });
      try {
        await syncJugadorPartidoFromTeams(partido, partido.creadoPor);
        await syncMatchPlayersFromTeams(partido);
      } catch (e) {}
    }

    // Save AFK players if provided
    if (Array.isArray(afkPlayers)) {
      partido.rankedMeta.afkPlayers = afkPlayers;
    }

    // Save sets if provided
    if (Array.isArray(sets) && sets.length > 0) {
      await SetPartido.deleteMany({ partido: partidoId });
      
      const suddenDeathLimit = partido.rankedMeta?.suddenDeathLimit || 180;

      const setDocs = sets.map((s, idx) => {
        const prevSetTime = idx > 0 ? sets[idx - 1].time : 0;
        const durationMs = s.time - prevSetTime;
        const durationSec = Math.round(durationMs / 1000);
        return {
          partido: partidoId,
          numeroSet: idx + 1,
          ganadorSet: s.winner,
          estadoSet: 'finalizado',
          duracionReal: durationSec,
          suddenDeathMode: durationSec > suddenDeathLimit,
          meta: { matchRelativeTime: s.time },
          creadoPor
        };
      });
      await SetPartido.insertMany(setDocs);
    }

    // Check playoff tie restriction
    if (partido.fase) {
      const Fase = mongoose.model('Fase');
      const faseDoc = await Fase.findById(partido.fase).lean();
      if (faseDoc?.tipo === 'playoff' && partido.marcadorLocal === partido.marcadorVisitante) {
        return res.status(400).json({ ok: false, error: 'Empates no permitidos en playoff' });
      }
    }

    // Ensure teams exist before finalizing (avoid silent zero-player rankings)
    let teams = await MatchTeam.find({ partidoId }).lean();
    let totalPlayers = (teams || []).reduce((sum, t) => sum + (Array.isArray(t.players) ? t.players.length : 0), 0);

    // Fallback: try to rebuild rosters from JugadorPartido if teams are missing
    if (totalPlayers === 0) {
      const jps = await JugadorPartido.find({ partido: partidoId, estado: 'aceptado', rol: 'jugador' }).lean();
      const localId = partido.equipoLocal?.toString();
      const visitId = partido.equipoVisitante?.toString();
      const rojoPlayers = jps.filter(jp => jp.equipo?.toString() === localId).map(jp => jp.jugador?.toString()).filter(Boolean).slice(0, 9);
      const azulPlayers = jps.filter(jp => jp.equipo?.toString() === visitId).map(jp => jp.jugador?.toString()).filter(Boolean).slice(0, 9);

      if (rojoPlayers.length || azulPlayers.length) {
        await MatchTeam.updateOne({ partidoId, color: 'rojo' }, { $set: { players: rojoPlayers } }, { upsert: true });
        await MatchTeam.updateOne({ partidoId, color: 'azul' }, { $set: { players: azulPlayers } }, { upsert: true });
        try {
          await syncJugadorPartidoFromTeams(partido, partido.creadoPor);
          await syncMatchPlayersFromTeams(partido);
        } catch (e) {}
        teams = await MatchTeam.find({ partidoId }).lean();
        totalPlayers = (teams || []).reduce((sum, t) => sum + (Array.isArray(t.players) ? t.players.length : 0), 0);
      }
    }

    if (totalPlayers === 0) {
      return res.status(400).json({ ok: false, error: 'No hay jugadores asignados. Guardá equipos antes de finalizar.' });
    }

    // Mark as finalizado if not already (optional)
    partido.estado = 'finalizado';
    await partido.save();

    // Post-save hook will apply ranking and snapshot to MatchPlayer; reload for response
    const updated = await Partido.findById(partidoId).lean();
    const teamsAfter = await MatchTeam.find({ partidoId }).lean();
    const matchPlayersAfter = await MatchPlayer.find({ partidoId }).lean();
    const totalPlayersAfter = (teamsAfter || []).reduce((sum, t) => sum + (Array.isArray(t.players) ? t.players.length : 0), 0);
    const deltaCount = matchPlayersAfter.filter(mp => typeof mp.delta === 'number').length;

    res.json({
      ok: true,
      rankedMeta: updated?.rankedMeta,
      ratingDeltas: updated?.ratingDeltas,
      debug: {
        teams: teamsAfter.length,
        totalPlayers: totalPlayersAfter,
        matchPlayers: matchPlayersAfter.length,
        withDelta: deltaCount
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List per-match player snapshots
router.get('/match/:id/players', async (req, res) => {
  try {
    const partidoId = req.params.id;
    const partido = await Partido.findById(partidoId).lean();
    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    const players = await MatchPlayer.find({ partidoId }).populate('playerId').lean();
    res.json({ ok: true, items: players });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Player rating
router.get('/players/:playerId/rating', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { competition: competenciaId, season: temporadaId, modalidad, categoria } = req.query;
    const q = { playerId };
    if (competenciaId) q.competenciaId = competenciaId;
    if (temporadaId) q.temporadaId = temporadaId;
    if (modalidad) q.modalidad = normalizeEnum(modalidad);
    if (categoria) q.categoria = normalizeEnum(categoria);
    const pr = await PlayerRating.find(q).lean();
    res.json({ ok: true, items: pr });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get player rating detail with match history
router.get('/players/:playerId/detail', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { competition: competenciaId, season: temporadaId, modalidad, categoria } = req.query;
    
    const query = { playerId };
    
    if (competenciaId && competenciaId !== 'null') {
      query.competenciaId = competenciaId;
    } else {
      query.competenciaId = null;
    }

    if (temporadaId && temporadaId !== 'null' && temporadaId !== 'global') {
      query.temporadaId = temporadaId;
    } else {
      query.temporadaId = null;
    }

    if (modalidad && modalidad !== 'null' && modalidad !== '') {
      query.modalidad = normalizeEnum(modalidad);
    }
    
    if (categoria && categoria !== 'null' && categoria !== '') {
      query.categoria = normalizeEnum(categoria);
    }

    const rating = await PlayerRating.findOne(query).populate('playerId', 'nombre').lean();
    
    // History logic: 
    // We must be specific about the temporadaId to avoid duplicate records per match 
    // (since we save at Master, Competition Global, and Season levels).
    const historyQuery = { 
      playerId, 
      competenciaId: (competenciaId === 'null' || !competenciaId) ? null : competenciaId,
      temporadaId: (temporadaId === 'null' || !temporadaId || temporadaId === 'global') ? null : temporadaId
    };

    if (modalidad && modalidad !== 'null') historyQuery.modalidad = normalizeEnum(modalidad);
    if (categoria && categoria !== 'null') historyQuery.categoria = normalizeEnum(categoria);

    const history = await MatchPlayer.find(historyQuery).populate('partidoId').sort({ createdAt: -1 }).lean();

    // Calculate teammate synergies and rivalries
    const teammateStats = {};
    const rivalStats = {};
    const matchIds = history.map(h => h.partidoId?._id || h.partidoId).filter(Boolean);
    
    if (matchIds.length > 0) {
      const allParticipants = await MatchPlayer.find({ 
        partidoId: { $in: matchIds },
        temporadaId: query.temporadaId
      }).populate('playerId', 'nombre').lean();

      for (const h of history) {
        const pId = h.partidoId?._id || h.partidoId;
        const isWin = (h.win === true || (h.win === undefined && h.delta > 0));
        
        // Find participants in the same match
        const participants = allParticipants.filter(p => p.partidoId.toString() === pId.toString());

        for (const p of participants) {
          const tId = p.playerId?._id?.toString();
          if (!tId || tId === playerId) continue;
          
          if (p.teamColor === h.teamColor) {
            // Teammate
            if (!teammateStats[tId]) {
              teammateStats[tId] = { 
                id: tId, 
                name: p.playerId?.nombre || 'Desconocido', 
                matches: 0, 
                wins: 0,
                matchIds: []
              };
            }
            teammateStats[tId].matches++;
            teammateStats[tId].matchIds.push(pId.toString());
            if (isWin) teammateStats[tId].wins++;
          } else {
            // Rival
            if (!rivalStats[tId]) {
              rivalStats[tId] = { 
                id: tId, 
                name: p.playerId?.nombre || 'Desconocido', 
                matches: 0, 
                wins: 0,
                matchIds: []
              };
            }
            rivalStats[tId].matches++;
            rivalStats[tId].matchIds.push(pId.toString());
            if (isWin) rivalStats[tId].wins++;
          }
        }
      }
    }

    const synergy = Object.values(teammateStats)
      .map(s => ({
        ...s,
        winrate: (s.wins / s.matches) * 100
      }))
      .sort((a, b) => b.matches - a.matches || b.winrate - a.winrate);

    const rivalry = Object.values(rivalStats)
      .map(s => ({
        ...s,
        winrate: (s.wins / s.matches) * 100
      }))
      .sort((a, b) => b.matches - a.matches || a.winrate - b.winrate);

    res.json({ ok: true, rating, history, synergy, rivalry });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/players/:playerId/rank-context', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { competition: competenciaId, season: temporadaId, modalidad, categoria } = req.query;

    const q = {};
    if (competenciaId && competenciaId !== 'null' && competenciaId !== '') {
      q.competenciaId = competenciaId;
    } else {
      q.competenciaId = null;
    }

    if (!temporadaId || temporadaId === 'null' || temporadaId === 'global') {
      q.temporadaId = null;
    } else {
      q.temporadaId = temporadaId;
    }
    if (modalidad) q.modalidad = normalizeEnum(modalidad);
    if (categoria) q.categoria = normalizeEnum(categoria);

    // Get the player's rating first
    const playerRating = await PlayerRating.findOne({ ...q, playerId })
      .populate('playerId', 'nombre foto')
      .lean();
    if (!playerRating) {
      return res.json({ ok: true, rank: null, context: [] });
    }

    // Get the rank (count how many have higher rating)
    const rank = await PlayerRating.countDocuments({
      ...q,
      rating: { $gt: playerRating.rating }
    }) + 1;

    // Get 3 above and 3 below using stable sort (rating DESC, _id ASC)
    // To get above: (rating > current) OR (rating == current AND _id < current)
    const above = await PlayerRating.find({
      ...q,
      $or: [
        { rating: { $gt: playerRating.rating } },
        { rating: playerRating.rating, _id: { $lt: playerRating._id } }
      ]
    })
    .sort({ rating: 1, _id: -1 }) // Closest first
    .limit(3)
    .populate('playerId', 'nombre foto')
    .lean();

    // To get below: (rating < current) OR (rating == current AND _id > current)
    const below = await PlayerRating.find({
      ...q,
      $or: [
        { rating: { $lt: playerRating.rating } },
        { rating: playerRating.rating, _id: { $gt: playerRating._id } }
      ]
    })
    .sort({ rating: -1, _id: 1 }) // Closest first
    .limit(3)
    .populate('playerId', 'nombre foto')
    .lean();

    // Combine all to calculate individual ranks
    const allContext = [...above, playerRating, ...below];
    
    // Function to get rank for a specific rating
    const getRankForRating = async (r) => {
      return await PlayerRating.countDocuments({
        ...q,
        rating: { $gt: r }
      }) + 1;
    };

    // Build the final context with real ranks
    const contextPromises = allContext.map(async (p) => {
      const pRank = await getRankForRating(p.rating);
      return {
        ...p,
        rank: pRank,
        isCurrent: p.playerId?._id?.toString() === playerId || p.playerId?.toString() === playerId
      };
    });

    const finalContext = await Promise.all(contextPromises);
    // Final sort to ensure they are displayed from best to worst
    finalContext.sort((a, b) => b.rating - a.rating || (a._id.toString() < b._id.toString() ? -1 : 1));

    res.json({ ok: true, rank, context: finalContext });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Force recalculate a single player's rating based on their MatchPlayer history
router.post('/players/:playerId/recalculate', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { competition: competenciaId, season: temporadaId, modalidad, categoria } = req.body;
    
    const query = { playerId };

    if (competenciaId && competenciaId !== 'null') {
      query.competenciaId = competenciaId;
    } else {
      query.competenciaId = null;
    }

    if (temporadaId && temporadaId !== 'null' && temporadaId !== 'global') {
      query.temporadaId = temporadaId;
    } else {
      query.temporadaId = null;
    }

    if (modalidad && modalidad !== 'null' && modalidad !== '') {
      query.modalidad = normalizeEnum(modalidad);
    }
    
    if (categoria && categoria !== 'null' && categoria !== '') {
      query.categoria = normalizeEnum(categoria);
    }

    const history = await MatchPlayer.find(query).sort({ createdAt: 1 }).lean();
    
    let currentRating = 1500;
    let matchesCount = 0;
    let winsCount = 0;
    let lastDelta = 0;

    for (const match of history) {
      if (typeof match.delta === 'number') {
        currentRating += match.delta;
        matchesCount++;
        if (match.win || match.delta > 0) winsCount++; // fallback to delta > 0 for old records
        lastDelta = match.delta;
      }
    }

    const pr = await PlayerRating.findOneAndUpdate(
      query,
      { $set: { rating: currentRating, matchesPlayed: matchesCount, wins: winsCount, lastDelta, updatedAt: new Date() } },
      { upsert: true, new: true }
    );

    res.json({ ok: true, pr });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a player's rating record (removes them from leaderboard)
router.delete('/players/:playerId/rating', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { competition: competenciaId, season: temporadaId, modalidad, categoria, deleteHistory = 'true' } = req.query;
    
    const query = { playerId };

    if (competenciaId && competenciaId !== 'null') {
      query.competenciaId = competenciaId;
    } else {
      query.competenciaId = null;
    }

    if (temporadaId && temporadaId !== 'null' && temporadaId !== 'global') {
      query.temporadaId = temporadaId;
    } else {
      query.temporadaId = null;
    }

    if (modalidad && modalidad !== 'null' && modalidad !== '') {
      query.modalidad = normalizeEnum(modalidad);
    }
    
    if (categoria && categoria !== 'null' && categoria !== '') {
      query.categoria = normalizeEnum(categoria);
    }

    const prResult = await PlayerRating.deleteOne(query);
    let mpResult = { deletedCount: 0 };
    
    if (deleteHistory === 'true') {
      mpResult = await MatchPlayer.deleteMany(query);
    }

    res.json({ ok: true, deletedRating: prResult.deletedCount, deletedHistory: mpResult.deletedCount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Dev-only: Sync all player wins from their MatchPlayer history
router.post('/dev/sync-all-wins', async (req, res) => {
  try {
    const ratings = await PlayerRating.find({});
    let updatedCount = 0;

    for (const pr of ratings) {
      const query = { 
        playerId: pr.playerId, 
        competenciaId: pr.competenciaId, 
        temporadaId: pr.temporadaId,
        modalidad: pr.modalidad,
        categoria: pr.categoria
      };

      const history = await MatchPlayer.find(query).lean();
      let wins = 0;
      for (const h of history) {
        if (h.win === true || (h.win === undefined && h.delta > 0)) wins++;
      }

      pr.wins = wins;
      await pr.save();
      updatedCount++;
    }

    res.json({ ok: true, updatedCount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a specific match snapshot (MatchPlayer) and optionally recalculate
router.delete('/match-player/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mp = await MatchPlayer.findById(id);
    if (!mp) return res.status(404).json({ ok: false, error: 'Snapshot no encontrado' });

    const { playerId, competenciaId, temporadaId, modalidad, categoria } = mp;
    await mp.deleteOne();

    // Trigger recalculate for this player in this specific context
    const history = await MatchPlayer.find({ playerId, competenciaId, temporadaId, modalidad, categoria }).sort({ createdAt: 1 }).lean();
    
    let currentRating = 1500;
    let matchesCount = 0;
    let winsCount = 0;
    let lastDelta = 0;

    for (const match of history) {
      if (typeof match.delta === 'number') {
        currentRating += match.delta;
        matchesCount++;
        if (match.win || (match.win === undefined && match.delta > 0)) winsCount++;
        lastDelta = match.delta;
      }
    }

    const pr = await PlayerRating.findOneAndUpdate(
      { playerId, competenciaId, temporadaId, modalidad, categoria },
      { $set: { rating: currentRating, matchesPlayed: matchesCount, wins: winsCount, lastDelta, updatedAt: new Date() } },
      { upsert: true, new: true }
    );

    res.json({ ok: true, message: 'Snapshot eliminado y ranking recalibrado', pr });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { competition: competenciaId, season: temporadaId, modalidad, categoria, limit = 50, minMatches = 0 } = req.query;
    const q = {};
    
    if (competenciaId && competenciaId !== 'null' && competenciaId !== '') {
      q.competenciaId = competenciaId;
    } else {
      q.competenciaId = null;
    }
    
    // Default to Global (temporadaId: null) if season is not specified or explicit 'global'
    if (!temporadaId || temporadaId === 'null' || temporadaId === 'global') {
      q.temporadaId = null;
    } else {
      q.temporadaId = temporadaId;
    }
    
    if (modalidad) q.modalidad = normalizeEnum(modalidad);
    if (categoria) q.categoria = normalizeEnum(categoria);

    const items = await PlayerRating.find(q)
      .where('matchesPlayed').gte(Number(minMatches))
      .sort({ rating: -1 })
      .limit(Number(limit))
      .populate('playerId', 'nombre')
      .lean();

    const mappedItems = items.map(i => ({
      ...i,
      playerName: i.playerId?.nombre || 'Desconocido',
      playerId: i.playerId?._id || i.playerId
    }));

    res.json({ ok: true, items: mappedItems });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Dev-only: Seed players quickly for local MVP testing
router.post('/dev/players/seed', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'No disponible en producción' });
    }

    const { names = [], count = 0, creadoPor = 'ranked-mvp' } = req.body || {};
    const toCreate = [];
    if (Array.isArray(names) && names.length) {
      for (const n of names) {
        if (typeof n === 'string' && n.trim()) {
          toCreate.push({ nombre: n.trim(), fechaNacimiento: new Date('2000-01-01'), genero: 'otro', creadoPor, administradores: [] });
        }
      }
    } else if (count && Number(count) > 0) {
      for (let i = 1; i <= Number(count); i++) {
        toCreate.push({ nombre: `Jugador ${i}`, fechaNacimiento: new Date('2000-01-01'), genero: 'otro', creadoPor, administradores: [] });
      }
    } else {
      return res.status(400).json({ ok: false, error: 'Proveer names[] o count' });
    }

    const created = await Jugador.insertMany(toCreate);
    const items = created.map(j => ({ _id: j._id, nombre: j.nombre }));
    res.status(201).json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Dev-only: List recent players (lightweight)
router.get('/dev/players', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'No disponible en producción' });
    }
    const limit = Number(req.query.limit || 20);
    const items = await Jugador.find({}, 'nombre _id').sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Auto-assign players into balanced teams (by rating), capped 9 per side
router.post('/match/:id/auto-assign', async (req, res) => {
  try {
    const partidoId = req.params.id;
    const { players = [], balanced = true, seed } = req.body || {};

    const partido = await Partido.findById(partidoId);
    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    if (!partido.isRanked) return res.status(400).json({ ok: false, error: 'Partido no es ranked' });

    // Determine context for ratings
    const modalidad = normalizeEnum(partido.rankedMeta?.modalidad || partido.modalidad);
    const categoria = normalizeEnum(partido.rankedMeta?.categoria || partido.categoria);

    // Optional temporada from fase
    let temporadaId = undefined;
    if (partido.fase) {
      const Fase = mongoose.model('Fase');
      const faseDoc = await Fase.findById(partido.fase).populate('temporada');
      temporadaId = faseDoc?.temporada?._id;
    }

    // Sanitize players
    const unique = Array.from(new Set((Array.isArray(players) ? players : []).filter(p => mongoose.isValidObjectId(p)).map(p => p.toString())));
    if (unique.length < 2) return res.status(400).json({ ok: false, error: 'Se requieren al menos 2 jugadores válidos' });

    // Cap to 18 total
    const pool = unique.slice(0, 18);

    // Helper: shuffle (deterministic if seed provided)
    const shuffle = (arr) => {
      const a = [...arr];
      let s = typeof seed === 'number' ? seed : Math.floor(Math.random() * 1e9);
      for (let i = a.length - 1; i > 0; i--) {
        s = (s * 9301 + 49297) % 233280; // LCG
        const j = Math.floor((s / 233280) * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    let rojoPlayers = [];
    let azulPlayers = [];

    if (!balanced) {
      const shuffled = shuffle(pool);
      rojoPlayers = shuffled.filter((_, idx) => idx % 2 === 0).slice(0, 9);
      azulPlayers = shuffled.filter((_, idx) => idx % 2 === 1).slice(0, 9);
    } else {
      // Load ratings and sort desc
      const rated = await Promise.all(pool.map(async (pid) => {
        const pr = await getOrCreatePlayerRating({ playerId: pid, competenciaId: partido.competencia, temporadaId, modalidad, categoria });
        return { playerId: pid, rating: pr.rating || 1500 };
      }));
      rated.sort((a, b) => (b.rating || 1500) - (a.rating || 1500));

      let sumR = 0, sumA = 0;
      for (const r of rated) {
        if ((rojoPlayers.length < 9) && (sumR <= sumA)) {
          rojoPlayers.push(r.playerId);
          sumR += r.rating || 1500;
        } else if (azulPlayers.length < 9) {
          azulPlayers.push(r.playerId);
          sumA += r.rating || 1500;
        } else if (rojoPlayers.length < 9) {
          rojoPlayers.push(r.playerId);
          sumR += r.rating || 1500;
        }
      }
    }

    const benched = pool.filter(id => !rojoPlayers.includes(id) && !azulPlayers.includes(id));

    // Persist assignments
    await MatchTeam.updateOne({ partidoId, color: 'rojo' }, { $set: { players: rojoPlayers } }, { upsert: true });
    await MatchTeam.updateOne({ partidoId, color: 'azul' }, { $set: { players: azulPlayers } }, { upsert: true });
    try {
      const partidoAfter = await Partido.findById(partidoId);
      await syncJugadorPartidoFromTeams(partidoAfter);
      await syncMatchPlayersFromTeams(partidoAfter);
    } catch (e) {}

    // Return summary
    const avg = (arr) => arr.length ? (arr.length && arr.reduce((s, x) => s + (typeof x === 'number' ? x : 0), 0)) : 0;
    res.json({ ok: true, rojoPlayers, azulPlayers, extras: benched });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mark an existing partido as ranked and auto-populate teams from JugadorPartido
router.post('/match/:id/mark-ranked', async (req, res) => {
  try {
    const partidoId = req.params.id;
    const partido = await Partido.findById(partidoId);
    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

    // Set ranked flags and defaults
    partido.isRanked = true;
    partido.rankedMeta = partido.rankedMeta || {};
    if (!partido.rankedMeta.modalidad) partido.rankedMeta.modalidad = normalizeEnum(partido.modalidad);
    if (!partido.rankedMeta.categoria) partido.rankedMeta.categoria = normalizeEnum(partido.categoria);
    partido.rankedMeta.teamColors = partido.rankedMeta.teamColors || { local: 'rojo', visitante: 'azul' };
    await partido.save();

    // Load JugadorPartido and split by equipoLocal/Visitante
    const jps = await JugadorPartido.find({ partido: partido._id, estado: 'aceptado', rol: 'jugador' }).lean();
    const localId = partido.equipoLocal?.toString();
    const visitId = partido.equipoVisitante?.toString();
    const rojoPlayers = jps.filter(jp => jp.equipo?.toString() === localId).map(jp => jp.jugador?.toString()).filter(Boolean).slice(0, 9);
    const azulPlayers = jps.filter(jp => jp.equipo?.toString() === visitId).map(jp => jp.jugador?.toString()).filter(Boolean).slice(0, 9);

    await MatchTeam.updateOne({ partidoId, color: 'rojo' }, { $set: { players: rojoPlayers } }, { upsert: true });
    await MatchTeam.updateOne({ partidoId, color: 'azul' }, { $set: { players: azulPlayers } }, { upsert: true });
    try {
      await syncJugadorPartidoFromTeams(partido);
      await syncMatchPlayersFromTeams(partido);
    } catch (e) {}
    res.json({ ok: true, rojoPlayers, azulPlayers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Revert ranked match stats
router.post('/match/:id/revert', async (req, res) => {
  try {
    const partidoId = req.params.id;
    const { revertRankedResult } = await import('../services/ratingService.js');
    
    await revertRankedResult({ partidoId });
    
    // If partido exists, unmark it as applied
    const partido = await Partido.findById(partidoId);
    if (partido) {
      partido.estado = 'en_juego'; // Allow re-editing in tools
      if (partido.rankedMeta) {
        partido.rankedMeta.applied = false;
        partido.rankedMeta.snapshot = null;
      }
      partido.ratingDeltas = [];
      await partido.save();
      // Ensure rosters are still synced after revert (if any players remained)
      await syncJugadorPartidoFromTeams(partido, partido.creadoPor);
      await syncMatchPlayersFromTeams(partido);
    }

    res.json({ ok: true, message: 'Ranked stats reverted' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Regenerate Global Rankings (Recalculate everything from scratch)
router.post('/recalculate-global', async (req, res) => {
  try {
    // 1. Reset all PlayerRating and MatchPlayer
    await PlayerRating.deleteMany({});
    await MatchPlayer.deleteMany({});

    // 2. Mark matches as not applied
    await Partido.updateMany(
      { isRanked: true },
      {
        $set: {
          'rankedMeta.applied': false,
          'rankedMeta.snapshot': null,
          ratingDeltas: []
        }
      }
    );

    // 3. Find all ranked matches, sorted by date
    const matches = await Partido.find({ isRanked: true, estado: 'finalizado' })
      .sort({ fecha: 1, createdAt: 1 });

    let count = 0;
    for (const match of matches) {
      // Important: Use save() to trigger the post('save') hook in Partido.js
      await match.save();
      count++;
    }

    res.json({ ok: true, message: `Rankings recalculated for ${count} matches.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reset rankings for a specific competition/season/modality/category
router.post('/reset-scope', async (req, res) => {
  try {
    const { competenciaId, temporadaId, modalidad, categoria } = req.body;
    
    if (!competenciaId || !modalidad || !categoria) {
      return res.status(400).json({ ok: false, error: 'Se requiere competenciaId, modalidad y categoria' });
    }

    const query = {
      competenciaId,
      modalidad: normalizeEnum(modalidad),
      categoria: normalizeEnum(categoria)
    };
    
    // Add temporadaId to query if provided
    if (temporadaId) {
      query.temporadaId = temporadaId;
    }

    // 1. Delete PlayerRating for this scope
    const prResult = await PlayerRating.deleteMany(query);

    // 2. Delete MatchPlayer for this scope
    const mpResult = await MatchPlayer.deleteMany(query);

    // 3. Reset Partidos in this scope to unranked state
    const partidoQuery = {
      isRanked: true,
      competencia: competenciaId,
      'rankedMeta.modalidad': normalizeEnum(modalidad),
      'rankedMeta.categoria': normalizeEnum(categoria)
    };
    if (temporadaId) {
      partidoQuery.temporada = temporadaId;
    }

    const partidoResult = await Partido.updateMany(
      partidoQuery,
      {
        $set: {
          'rankedMeta.applied': false,
          'rankedMeta.snapshot': null,
          ratingDeltas: []
        }
      }
    );

    res.json({ 
      ok: true, 
      message: `Rankings reset for scope: ${prResult.deletedCount} PlayerRatings, ${mpResult.deletedCount} MatchPlayers, ${partidoResult.modifiedCount} matches unmarked.`,
      deleted: { playerRatings: prResult.deletedCount, matchPlayers: mpResult.deletedCount },
      updated: { matches: partidoResult.modifiedCount }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Recalculate rankings for a specific competition/season/modality/category from MatchPlayer snapshots
router.post('/recalculate-scope', async (req, res) => {
  try {
    const { competenciaId, temporadaId, modalidad, categoria } = req.body;

    if (!competenciaId || !modalidad || !categoria) {
      return res.status(400).json({ ok: false, error: 'Se requiere competenciaId, modalidad y categoria' });
    }

    const query = {
      competenciaId,
      modalidad: normalizeEnum(modalidad),
      categoria: normalizeEnum(categoria)
    };
    if (temporadaId) query.temporadaId = temporadaId;
    else query.temporadaId = null;

    // Reset PlayerRating for this scope, then rebuild from MatchPlayer history
    await PlayerRating.deleteMany(query);

    const playerIds = await MatchPlayer.distinct('playerId', query);
    let updatedCount = 0;

    for (const playerId of playerIds) {
      const history = await MatchPlayer.find({ ...query, playerId })
        .sort({ createdAt: 1 })
        .lean();

      let currentRating = 1500;
      let matchesCount = 0;
      let winsCount = 0;
      let lastDelta = 0;

      for (const match of history) {
        if (typeof match.delta === 'number') {
          currentRating += match.delta;
          matchesCount++;
          if (match.win || (match.win === undefined && match.delta > 0)) winsCount++;
          lastDelta = match.delta;
        }
      }

      await PlayerRating.findOneAndUpdate(
        { ...query, playerId },
        { $set: { rating: currentRating, matchesPlayed: matchesCount, wins: winsCount, lastDelta, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
      updatedCount++;
    }

    res.json({ ok: true, updatedCount, scope: query });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Dev-only: Reset all rankings (Hard Reset)
router.post('/dev/reset-all', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      // Optional: protect this in production
      // return res.status(403).json({ ok: false, error: 'No disponible en producción' });
    }

    // 1. Delete all PlayerRating
    await PlayerRating.deleteMany({});

    // 2. Delete all MatchPlayer
    await MatchPlayer.deleteMany({});

    // 3. Reset all Partidos to unranked state
    await Partido.updateMany(
      { isRanked: true },
      {
        $set: {
          isRanked: false,
          'rankedMeta.applied': false,
          'rankedMeta.snapshot': null,
          ratingDeltas: []
        }
      }
    );

    res.json({ ok: true, message: 'All rankings reset. You can now re-rank matches.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete multiple player ratings at once for a specific scope
router.post('/players/bulk-delete-rating', async (req, res) => {
  try {
    const { playerIds, modalidad, categoria } = req.body;
    const rawComp = req.body.competenciaId || req.body.competition;
    const rawSeason = req.body.temporadaId || req.body.season;
    
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'Lista de IDs de jugadores requerida' });
    }

    // Explicitly convert IDs to ObjectIds if they are valid strings
    const validPlayerIds = playerIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const query = { 
      playerId: { $in: validPlayerIds },
      competenciaId: (rawComp === 'null' || !rawComp) ? null : new mongoose.Types.ObjectId(rawComp),
      temporadaId: (rawSeason === 'null' || !rawSeason) ? null : new mongoose.Types.ObjectId(rawSeason),
      modalidad: normalizeEnum(modalidad),
      categoria: normalizeEnum(categoria)
    };

    // If we're in "Global" mode (no comp ID), we MUST ensure the query actually looks for null
    if (!rawComp || rawComp === 'null') query.competenciaId = null;
    if (!rawSeason || rawSeason === 'null') query.temporadaId = null;

    const prResult = await PlayerRating.deleteMany(query);
    const mpResult = await MatchPlayer.deleteMany(query);

    res.json({ 
      ok: true, 
      deletedRating: prResult.deletedCount, 
      deletedHistory: mpResult.deletedCount,
      queryUsed: query // Para debugging si fuera necesario
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Clean up all player ratings with 0 matches played (ghosts)
router.post('/cleanup-ghosts', async (req, res) => {
  try {
    const { modalidad, categoria } = req.body;
    const rawComp = req.body.competenciaId || req.body.competition;
    const rawSeason = req.body.temporadaId || req.body.season;

    const query = { matchesPlayed: 0 };
    
    if (rawComp && rawComp !== 'null') {
      query.competenciaId = new mongoose.Types.ObjectId(rawComp);
    } else if (rawComp === 'null' || !rawComp) {
      query.competenciaId = null;
    }

    if (rawSeason && rawSeason !== 'null' && rawSeason !== 'global') {
      query.temporadaId = new mongoose.Types.ObjectId(rawSeason);
    } else {
      query.temporadaId = null;
    }

    if (modalidad) query.modalidad = normalizeEnum(modalidad);
    if (categoria) query.categoria = normalizeEnum(categoria);

    const result = await PlayerRating.deleteMany(query);
    res.json({ ok: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
