// utils/generarEliminatoria.js
import { shuffleArray } from './helpers.js';

export function generarEliminatoriaDirecta(participaciones, datosBase, fase) {
  let participantes = [...participaciones];
  if (fase.shuffleParticipantes) {
    shuffleArray(participantes);
  }

  const partidos = [];

  for (let i = 0; i < participantes.length; i += 2) {
    const local = participantes[i];
    const visitante = participantes[i + 1];

    const equipoLocal = local?.participacionTemporada?.equipo?._id;
    const equipoVisitante = visitante?.participacionTemporada?.equipo?._id;

    if (equipoLocal && equipoVisitante) {
      partidos.push({
        ...datosBase,
        equipoLocal,
        equipoVisitante,
        participacionFaseLocal: local._id,
        participacionFaseVisitante: visitante._id,
        etapa: 'octavos', // o dinámica según cantidad total
      });
    }
  }

  return partidos;
}
