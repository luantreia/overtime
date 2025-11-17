// utils/generarEliminatoria.js
import { shuffleArray } from './helpers.js';

export function generarEliminatoriaDirecta(participaciones, datosBase, fase) {
  let participantes = [...participaciones];
  if (fase.shuffleParticipantes) {
    shuffleArray(participantes);
  }

  const partidos = [];

  for (let i = 0; i < participantes.length; i += 2) {
    const equipoLocal = participantes[i]?.equipo?._id;
    const equipoVisitante = participantes[i + 1]?.equipo?._id;

    if (equipoLocal && equipoVisitante) {
      partidos.push({
        ...datosBase,
        equipoLocal,
        equipoVisitante,
        etapa: 'octavos', // o dinámica según cantidad total
      });
    }
  }

  return partidos;
}
