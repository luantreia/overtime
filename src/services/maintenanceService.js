
import mongoose from 'mongoose';
import Partido from '../models/Partido/Partido.js';
import PlayerRating from '../models/Jugador/PlayerRating.js';
import MatchPlayer from '../models/Partido/MatchPlayer.js';
import { applyRankedResult } from './ratingService.js';

/**
 * Replays all finished matches into the Level 1 (Global Master) Ranking.
 * Only finishes matches from Verified Orgs (1.0x) or No Org (Plazas, 0.3x).
 * Clears existing Level 1 data before starting.
 */
export async function recalculateGlobalRanking() {
  console.log('--- Starting Global Ranking Recalculation ---');
  
  // 1. Clear Global Data (competenciaId: null)
  // We keep COMPETITION and SEASON rankings intact as they have their own logic.
  await PlayerRating.deleteMany({ competenciaId: null });
  await MatchPlayer.deleteMany({ competenciaId: null });
  console.log('Cleaned Level 1 (Global) records.');

  // 2. Fetch all finished matches sorted by date (important for ELO history)
  const matches = await Partido.find({ 
    estado: 'finalizado',
    isRanked: true,
    modalidad: { $exists: true },
    categoria: { $exists: true }
  })
    .sort({ fecha: 1 })
    .populate({
      path: 'competencia',
      populate: { path: 'organizacion' }
    });

  console.log(`Processing ${matches.length} matches...`);

  let count = 0;
  for (const match of matches) {
    let globalMultiplier = 0.3; 
    let shouldApplyGlobal = true;

    if (match.competencia) {
      const org = match.competencia.organizacion;
      if (org && org.verificada) {
        globalMultiplier = 1.0;
      } else {
        // If it belongs to an organization but it's not verified, 
        // by the current plan we might skip it or use a lower multiplier.
        // User said: "0.3x para Plazas/Pickups". Usually these don't have a formal Org.
        // For now, if it has an Org and it's not verified, we keep it as 0.3 (Plaza-like) 
        // to avoid losing data, OR skip it if they want stricter verification.
        // Based on previous turn: "Verified Org: 1.0x, Unverified Org: 0x (Skipped), No Org: 0.3x"
        shouldApplyGlobal = false;
        continue; 
      }
    } else {
      // No competencia = Plaza match
      globalMultiplier = 0.3;
    }

    if (shouldApplyGlobal) {
      const result = match.marcadorLocal > match.marcadorVisitante ? 'rojo' : 
                     match.marcadorLocal < match.marcadorVisitante ? 'azul' : 'empate';
      
      try {
        await applyRankedResult({
          partidoId: match._id,
          competenciaId: null,
          temporadaId: null,
          modalidad: match.modalidad,
          categoria: match.categoria,
          result: result,
          afkPlayerIds: [], // AFK data might be lost in history, we reset
          multiplier: globalMultiplier
        });
        count++;
      } catch (err) {
        console.error(`Error processing match ${match._id}:`, err.message);
      }
    }
  }

  console.log(`--- Finished! Recalculated ${count} matches into Global Ranking (Level 1) ---`);
  return { 
    totalProcessed: count,
    totalMatches: matches.length 
  };
}
