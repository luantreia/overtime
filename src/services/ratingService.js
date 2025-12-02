import PlayerRating from '../models/Jugador/PlayerRating.js';
import MatchPlayer from '../models/Partido/MatchPlayer.js';
import MatchTeam from '../models/Partido/MatchTeam.js';

function kFactor(matchesPlayed, rating) {
  if ((matchesPlayed || 0) < 30) return 32;
  if (rating > 2400) return 16;
  return 24;
}

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

export async function getOrCreatePlayerRating({ playerId, competenciaId, temporadaId, modalidad, categoria }) {
  const query = { playerId, competenciaId, temporadaId, modalidad, categoria };
  let pr = await PlayerRating.findOne(query);
  if (!pr) pr = await PlayerRating.create({ ...query });
  return pr;
}

export async function applyRankedResult({ partidoId, competenciaId, temporadaId, modalidad, categoria, result }) {
  const teams = await MatchTeam.find({ partidoId }).lean();
  const rojo = teams.find(t => t.color === 'rojo') || { players: [] };
  const azul = teams.find(t => t.color === 'azul') || { players: [] };

  const loadPreRatings = async (playerIds) => {
    const ratings = await Promise.all((playerIds || []).map(async pid => {
      const pr = await getOrCreatePlayerRating({ playerId: pid, competenciaId, temporadaId, modalidad, categoria });
      return { playerId: pid, rating: pr.rating, matchesPlayed: pr.matchesPlayed };
    }));
    return ratings;
  };

  const rojoPre = await loadPreRatings(rojo.players);
  const azulPre = await loadPreRatings(azul.players);

  const avg = arr => (arr.length ? arr.reduce((s, x) => s + (x.rating || 1500), 0) / arr.length : 1500);
  const R_rojo_avg = avg(rojoPre);
  const R_azul_avg = avg(azulPre);

  const E_rojo = expectedScore(R_rojo_avg, R_azul_avg);
  const E_azul = 1 - E_rojo;

  const S_rojo = result === 'rojo' ? 1 : result === 'azul' ? 0 : 0.5;
  const S_azul = 1 - S_rojo;

  const updatePlayer = async ({ playerId, preRating, preMatches, teamColor, S_team, E_team }) => {
    const K = kFactor(preMatches, preRating);
    const delta = K * (S_team - E_team);
    const post = preRating + delta;

    const pr = await getOrCreatePlayerRating({ playerId, competenciaId, temporadaId, modalidad, categoria });
    pr.rating = post;
    pr.matchesPlayed = (pr.matchesPlayed || 0) + 1;
    pr.lastDelta = delta;
    pr.updatedAt = new Date();
    await pr.save();

    await MatchPlayer.updateOne(
      { partidoId, playerId, temporadaId },
      {
        $set: {
          partidoId, playerId, teamColor, preRating, postRating: post, delta,
          competenciaId, temporadaId, modalidad, categoria
        }
      },
      { upsert: true }
    );

    return { playerId, pre: preRating, post, delta, teamColor };
  };

  const rojoSnap = await Promise.all(rojoPre.map(r =>
    updatePlayer({ playerId: r.playerId, preRating: r.rating, preMatches: r.matchesPlayed, teamColor: 'rojo', S_team: S_rojo, E_team: E_rojo })
  ));
  const azulSnap = await Promise.all(azulPre.map(r =>
    updatePlayer({ playerId: r.playerId, preRating: r.rating, preMatches: r.matchesPlayed, teamColor: 'azul', S_team: S_azul, E_team: E_azul })
  ));

  return {
    teamAverages: { rojo: R_rojo_avg, azul: R_azul_avg },
    players: [...rojoSnap, ...azulSnap]
  };
}

export async function revertRankedResult({ partidoId }) {
  const snapshots = await MatchPlayer.find({ partidoId });
  
  for (const snap of snapshots) {
    const pr = await PlayerRating.findOne({
      playerId: snap.playerId,
      competenciaId: snap.competenciaId,
      temporadaId: snap.temporadaId,
      modalidad: snap.modalidad,
      categoria: snap.categoria
    });

    if (pr) {
      pr.rating = (pr.rating || 1500) - (snap.delta || 0);
      pr.matchesPlayed = Math.max(0, (pr.matchesPlayed || 0) - 1);
      await pr.save();
    }
    
    await MatchPlayer.deleteOne({ _id: snap._id });
  }
}
