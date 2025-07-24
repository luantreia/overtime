// utils/fixtureGenerator.js

export const generarRoundRobinPorDivision = (participacionesFase, datosPartidoBase) => {
  const partidos = [];

  const divisiones = participacionesFase.reduce((acc, pf) => {
    const division = pf.division || 'sin_division';
    if (!acc[division]) acc[division] = [];
    acc[division].push(pf);
    return acc;
  }, {});

  for (const [division, equipos] of Object.entries(divisiones)) {
    for (let i = 0; i < equipos.length - 1; i++) {
      for (let j = i + 1; j < equipos.length; j++) {
        const local = equipos[i];
        const visitante = equipos[j];

        partidos.push({
          ...datosPartidoBase,
          participacionFaseLocal: local._id,
          participacionFaseVisitante: visitante._id,
          division,
        });
      }
    }
  }

  return partidos;
};
