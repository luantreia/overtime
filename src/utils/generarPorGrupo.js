// utils/generarPorGrupo.js
export function generarRoundRobinPorGrupo(participaciones, datosBase, fase) {
  const grupos = fase.grupos || [];
  const partidos = [];

  grupos.forEach((grupo) => {
    const equiposDelGrupo = participaciones.filter(
      (p) => p.grupo === grupo
    );

    for (let i = 0; i < equiposDelGrupo.length; i++) {
      for (let j = i + 1; j < equiposDelGrupo.length; j++) {
        partidos.push({
          ...datosBase,
          equipoLocal: equiposDelGrupo[i].equipo._id,
          equipoVisitante: equiposDelGrupo[j].equipo._id,
          grupo,
        });
      }
    }
  });

  return partidos;
}