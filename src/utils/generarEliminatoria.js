// utils/generarEliminatoria.js
import { shuffleArray } from './helpers.js';

export function generarEliminatoriaDirecta(participaciones, datosBase, fase) {
  // 1. Separar equipos con seed y sin seed
  let conSeed = participaciones.filter(p => typeof p.seed === 'number').sort((a, b) => a.seed - b.seed);
  let sinSeed = participaciones.filter(p => typeof p.seed !== 'number');

  if (fase.shuffleParticipantes) {
    shuffleArray(sinSeed);
  }

  // Combinar: primero los con seed en su orden, luego el resto
  let participantes = [...conSeed, ...sinSeed];
  const n = participantes.length;
  
  if (n < 2) return [];

  // 2. Determinar el tamaño de la llave (potencia de 2: 2, 4, 8, 16, 32...)
  const powerOfTwo = Math.pow(2, Math.ceil(Math.log2(n)));
  
  // 3. Emparejamiento profesional (1 vs Last, 2 vs Second Last...)
  // Rellenamos con nulls para los BYE (equipos que pasan de ronda sin jugar)
  const padded = [...participantes];
  while (padded.length < powerOfTwo) {
    padded.push(null);
  }

  const partidos = [];
  const totalPartidos = powerOfTwo / 2;

  // Lógica de emparejamiento de torneo
  for (let i = 0; i < totalPartidos; i++) {
    const local = padded[i];
    const visitante = padded[powerOfTwo - 1 - i];

    // Solo creamos el partido si hay al menos un equipo real
    if (local || visitante) {
      partidos.push({
        ...datosBase,
        equipoLocal: local?.participacionTemporada?.equipo?._id || local?.participacionTemporada?.equipo || null,
        equipoVisitante: visitante?.participacionTemporada?.equipo?._id || visitante?.participacionTemporada?.equipo || null,
        participacionFaseLocal: local?._id || null,
        participacionFaseVisitante: visitante?._id || null,
        etapa: determinarEtapa(powerOfTwo),
      });
    }
  }

  return partidos;
}

function determinarEtapa(numParticipantes) {
  if (numParticipantes <= 2) return 'final';
  if (numParticipantes <= 4) return 'semifinal';
  if (numParticipantes <= 8) return 'cuartos';
  if (numParticipantes <= 16) return 'octavos';
  if (numParticipantes <= 32) return 'dieciseisavos';
  return 'treintaidosavos';
}
