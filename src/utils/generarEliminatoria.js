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

  // Lógica de emparejamiento profesional (1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6)
  // Esta secuencia asegura que el #1 y #2 solo se crucen en la final.
  const getBracketOrder = (size) => {
    let order = [0, 1];
    for (let i = 2; i <= Math.log2(size); i++) {
        let nextOrder = [];
        const currentSize = Math.pow(2, i);
        for (let j = 0; j < order.length; j++) {
            nextOrder.push(order[j]);
            nextOrder.push(currentSize - 1 - order[j]);
        }
        order = nextOrder;
    }
    // Para size 8, order es [0, 7, 3, 4, 1, 6, 2, 5]
    // Pero nosotros necesitamos los PARES de partidos.
    return order;
  };

  const order = getBracketOrder(powerOfTwo);
  
  for (let i = 0; i < order.length; i += 2) {
    const localIdx = order[i];
    const visitIdx = order[i+1];
    
    const local = padded[localIdx];
    const visitante = padded[visitIdx];

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
