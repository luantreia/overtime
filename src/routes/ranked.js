import express from 'express';
import mongoose from 'mongoose';
import Partido from '../models/Partido/Partido.js';
import MatchTeam from '../models/Partido/MatchTeam.js';
import PlayerRating from '../models/Jugador/PlayerRating.js';
import Equipo from '../models/Equipo/Equipo.js';
import Jugador from '../models/Jugador/Jugador.js';
import { getOrCreatePlayerRating } from '../services/ratingService.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import MatchPlayer from '../models/Partido/MatchPlayer.js';

const router = express.Router();

function ensureArray(arr) { return Array.isArray(arr) ? arr : []; }

async function syncJugadorPartidoFromTeams(partido) {
  if (!partido) return;
  const partidoId = partido._id?.toString?.() || partido.toString?.();
  if (!partidoId) return;
  const teams = await MatchTeam.find({ partidoId: partidoId }).lean();
  if (!teams || !teams.length) return;
  const localId = partido.equipoLocal?.toString?.();
  const visitId = partido.equipoVisitante?.toString?.();
  const ops = [];
  for (const t of teams) {
    const equipo = t.color === 'rojo' ? localId : t.color === 'azul' ? visitId : undefined;
    if (!equipo) continue;
    for (const pid of (Array.isArray(t.players) ? t.players : [])) {
      const playerId = pid?.toString?.();
      if (!playerId) continue;
      ops.push({
        updateOne: {
          filter: { partido: partidoId, jugador: playerId },
          update: { $set: { equipo, rol: 'jugador', estado: 'aceptado' } },
          upsert: true,
        }
      });
    }
  }
  if (ops.length) {
    try {
      await JugadorPartido.bulkWrite(ops, { ordered: false });
    } catch (e) {
      // non-fatal
    }
  }
}

async function syncMatchPlayersFromTeams(partido) {
  if (!partido) return;
  const partidoId = partido._id?.toString?.() || partido.toString?.();
  if (!partidoId) return;
  const teams = await MatchTeam.find({ partidoId: partidoId }).lean();
  if (!teams || !teams.length) return;
  const modalidad = partido.rankedMeta?.modalidad || partido.modalidad;
  const categoria = partido.rankedMeta?.categoria || partido.categoria;
  const competenciaId = partido.competencia || undefined;
  const ops = [];
  for (const t of teams) {
    const color = t.color;
    for (const pid of (Array.isArray(t.players) ? t.players : [])) {
      const playerId = pid?.toString?.();
      if (!playerId) continue;
      ops.push({
        updateOne: {
          filter: { partidoId, playerId },
          update: {
            $setOnInsert: { competenciaId, modalidad, categoria },
            $set: { teamColor: color },
          },
          upsert: true,
        }
      });
    }
  }
  if (ops.length) {
    try {
      await MatchPlayer.bulkWrite(ops, { ordered: false });
    } catch (e) {
      // non-fatal
    }
  }
}

// Create ranked match with team assignments (cap 9 per side)
router.post('/match', async (req, res) => {
  try {
    const { competenciaId, temporadaId, modalidad, categoria, fecha, equipoLocal, equipoVisitante, creadoPor = 'ranked-mvp', rojoPlayers = [], azulPlayers = [], meta = {} } = req.body;
    const rojo = ensureArray(rojoPlayers);
    const azul = ensureArray(azulPlayers);

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
    try { await syncJugadorPartidoFromTeams(partido); } catch (e) {}
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
      await syncJugadorPartidoFromTeams(partido);
      await syncMatchPlayersFromTeams(partido);
    } catch (e) {}
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get match ranked detail
router.get('/match/:id', async (req, res) => {
  try {
    const partido = await Partido.findById(req.params.id).lean();
    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    const teams = await MatchTeam.find({ partidoId: partido._id }).populate('players').lean();
    const players = await MatchPlayer.find({ partidoId: partido._id }).populate('playerId').lean();
    res.json({ ok: true, partido, teams, players });
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
    if (partido?.rankedMeta?.applied) return res.status(400).json({ ok: false, error: 'Ranking ya aplicado' });

    // Optionally set scores from body
    const { marcadorLocal, marcadorVisitante } = req.body || {};
    if (typeof marcadorLocal === 'number') {
      partido.marcadorLocal = marcadorLocal;
      partido.marcadorModificadoManualmente = true;
    }
    if (typeof marcadorVisitante === 'number') {
      partido.marcadorVisitante = marcadorVisitante;
      partido.marcadorModificadoManualmente = true;
    }

    // Check playoff tie restriction
    if (partido.fase) {
      const Fase = mongoose.model('Fase');
      const faseDoc = await Fase.findById(partido.fase).lean();
      if (faseDoc?.tipo === 'playoff' && partido.marcadorLocal === partido.marcadorVisitante) {
        return res.status(400).json({ ok: false, error: 'Empates no permitidos en playoff' });
      }
    }

    // Mark as finalizado if not already (optional)
    partido.estado = 'finalizado';
    await partido.save();

    // Post-save hook will apply ranking; reload for response
    const updated = await Partido.findById(partidoId).lean();

    // Snapshot per-player rating changes into MatchPlayer
    try {
      const deltas = Array.isArray(updated?.ratingDeltas) ? updated.ratingDeltas : [];
      if (deltas.length) {
        const teamDocs = await MatchTeam.find({ partidoId }).lean();
        const colorByPlayer = new Map();
        for (const t of teamDocs) {
          const color = t.color;
          for (const pid of (Array.isArray(t.players) ? t.players : [])) {
            colorByPlayer.set(pid.toString(), color);
          }
        }

        const modalidad = updated?.rankedMeta?.modalidad || updated?.modalidad;
        const categoria = updated?.rankedMeta?.categoria || updated?.categoria;
        const competenciaId = updated?.competencia || undefined;

        const ops = deltas.map(d => ({
          updateOne: {
            filter: { partidoId, playerId: d.playerId },
            update: {
              $set: {
                preRating: d.pre,
                postRating: d.post,
                delta: d.delta,
                teamColor: colorByPlayer.get(d.playerId?.toString()) || null,
                competenciaId,
                modalidad,
                categoria,
              }
            },
            upsert: true
          }
        }));
        if (ops.length) {
          await MatchPlayer.bulkWrite(ops, { ordered: false });
        }
      }
    } catch (snapErr) {
      // Non-fatal: log server-side if logger exists
    }

    res.json({ ok: true, rankedMeta: updated?.rankedMeta, ratingDeltas: updated?.ratingDeltas });
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
    if (modalidad) q.modalidad = modalidad;
    if (categoria) q.categoria = categoria;
    const pr = await PlayerRating.find(q).lean();
    res.json({ ok: true, items: pr });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { competition: competenciaId, season: temporadaId, modalidad, categoria, limit = 50, minMatches = 0 } = req.query;
    const q = {};
    if (competenciaId) q.competenciaId = competenciaId;
    
    // Default to Global (temporadaId: null) if season is not specified or explicit 'global'
    if (!temporadaId || temporadaId === 'null' || temporadaId === 'global') {
      q.temporadaId = null;
    } else {
      q.temporadaId = temporadaId;
    }
    
    if (modalidad) q.modalidad = modalidad;
    if (categoria) q.categoria = categoria;

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
    const modalidad = partido.rankedMeta?.modalidad || partido.modalidad;
    const categoria = partido.rankedMeta?.categoria || partido.categoria;

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
    if (!partido.rankedMeta.modalidad) partido.rankedMeta.modalidad = partido.modalidad;
    if (!partido.rankedMeta.categoria) partido.rankedMeta.categoria = partido.categoria;
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
      if (partido.rankedMeta) {
        partido.rankedMeta.applied = false;
        partido.rankedMeta.snapshot = null;
      }
      partido.ratingDeltas = [];
      await partido.save();
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
      modalidad,
      categoria
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
      'rankedMeta.modalidad': modalidad,
      'rankedMeta.categoria': categoria
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

export default router;
