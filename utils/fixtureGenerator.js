// utils/fixtureGenerator.js

export const generarRoundRobinPorDivision = (participacionesFase, datosPartidoBase) => {
  const partidos = [];

  // Map para obtener equipos de las participaciones
  const participacionEquiposMap = {};

  participacionesFase.forEach((pf) => {
    participacionEquiposMap[pf._id.toString()] =
      pf.participacionTemporada?.equipo || null;
  });

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

        const equipoLocal = participacionEquiposMap[local._id.toString()];
        const equipoVisitante = participacionEquiposMap[visitante._id.toString()];

        if (!equipoLocal || !equipoVisitante) {
          // No generamos partidos sin equipos válidos
          continue;
        }

        partidos.push({
          ...datosPartidoBase,
          participacionFaseLocal: local._id,
          participacionFaseVisitante: visitante._id,
          equipoLocal,
          equipoVisitante,
          fecha: datosPartidoBase.fecha || new Date(), // asigna fecha, si no está usa hoy
          division,
        });
      }
    }
  }

  return partidos;
};

