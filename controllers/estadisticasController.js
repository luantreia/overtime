import Partido from '../models/Partido.js';

export const obtenerResumenEstadisticasJugador = async (req, res) => {
  const { jugadorId } = req.params;

  try {
    const partidos = await Partido.find({
      'sets.statsJugadoresSet.jugador': jugadorId
    }).lean();

    let totalPartidos = partidos.length;
    let totalThrows = 0, totalHits = 0, totalOuts = 0, totalCatches = 0;
    let ultimoPartido = null;
    const estadisticasPorPartido = [];

    partidos.forEach((partido) => {
      let statsPartido = { throws: 0, hits: 0, outs: 0, catches: 0 };

      partido.sets.forEach(set => {
        set.statsJugadoresSet.forEach(stat => {
          if (stat.jugador.toString() === jugadorId) {
            statsPartido.throws += stat.estadisticas?.throws || 0;
            statsPartido.hits += stat.estadisticas?.hits || 0;
            statsPartido.outs += stat.estadisticas?.outs || 0;
            statsPartido.catches += stat.estadisticas?.catches || 0;
          }
        });
      });

      totalThrows += statsPartido.throws;
      totalHits += statsPartido.hits;
      totalOuts += statsPartido.outs;
      totalCatches += statsPartido.catches;

      estadisticasPorPartido.push({
        _id: partido._id,
        fecha: partido.fecha,
        liga: partido.liga,
        equipoLocal: partido.equipoLocal,
        equipoVisitante: partido.equipoVisitante,
        marcadorLocal: partido.marcadorLocal,
        marcadorVisitante: partido.marcadorVisitante,
        ...statsPartido
      });

      if (!ultimoPartido || new Date(partido.fecha) > new Date(ultimoPartido.fecha)) {
        ultimoPartido = partido;
      }
    });

    const promedioThrows = totalPartidos ? (totalThrows / totalPartidos).toFixed(2) : 0;
    const promedioHits = totalPartidos ? (totalHits / totalPartidos).toFixed(2) : 0;
    const promedioOuts = totalPartidos ? (totalOuts / totalPartidos).toFixed(2) : 0;
    const promedioCatches = totalPartidos ? (totalCatches / totalPartidos).toFixed(2) : 0;

    res.json({
      totalPartidos,
      totalThrows,
      totalHits,
      totalOuts,
      totalCatches,
      promedioThrows,
      promedioHits,
      promedioOuts,
      promedioCatches,
      ultimoPartido: ultimoPartido ? {
        fecha: ultimoPartido.fecha,
        liga: ultimoPartido.liga,
        equipoLocal: ultimoPartido.equipoLocal,
        equipoVisitante: ultimoPartido.equipoVisitante,
        marcadorLocal: ultimoPartido.marcadorLocal,
        marcadorVisitante: ultimoPartido.marcadorVisitante,
      } : null,
      estadisticasPorPartido
    });
  } catch (error) {
    console.error('Error en obtenerResumenEstadisticasJugador:', error);
    res.status(500).json({ error: 'Error al obtener resumen de estadísticas del jugador' });
  }
};
