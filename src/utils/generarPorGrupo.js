// utils/generarPorGrupo.js
export function generarRoundRobinPorGrupo(participaciones, datosBase, fase) {
  // Obtenemos los grupos únicos de las participaciones, ya que fase.grupos no existe en el esquema
  const grupos = [...new Set(participaciones.map(p => p.grupo).filter(Boolean))];
  const partidos = [];

  grupos.forEach((grupo) => {
    const equiposDelGrupo = participaciones.filter(
      (p) => p.grupo === grupo
    );

    for (let i = 0; i < equiposDelGrupo.length; i++) {
      for (let j = i + 1; j < equiposDelGrupo.length; j++) {
        const local = equiposDelGrupo[i];
        const visitante = equiposDelGrupo[j];

        partidos.push({
          ...datosBase,
          equipoLocal: local.participacionTemporada?.equipo?._id,
          equipoVisitante: visitante.participacionTemporada?.equipo?._id,
          participacionFaseLocal: local._id,
          participacionFaseVisitante: visitante._id,
          grupo,
        });
      }
    }
  });

  return partidos;
}