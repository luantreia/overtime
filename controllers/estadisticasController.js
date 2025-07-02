// server/controllers/estadisticasController.js
import Partido from '../models/Partido.js';

export const obtenerResumenEstadisticasJugador = async (req, res) => {
  const { jugadorId } = req.params;

  try {
    const partidos = await Partido.find({
      'sets.statsJugadoresSet.jugador': jugadorId
    }).lean();

    let totalPartidos = partidos.length;
    let totalSets = 0;
    let totalThrows = 0, totalHits = 0, totalOuts = 0, totalCatches = 0;
    let ultimoPartido = null;
    const estadisticasPorPartido = [];

    partidos.forEach((partido) => {
      let statsPartido = { throws: 0, hits: 0, outs: 0, catches: 0 };
      let setsConStats = 0;

      partido.sets.forEach(set => {
        // Verificamos si el jugador tiene stats en este set
        const tieneStats = set.statsJugadoresSet.some(stat => stat.jugador.toString() === jugadorId);
        if (tieneStats) {
          setsConStats++;
          set.statsJugadoresSet.forEach(stat => {
            if (stat.jugador.toString() === jugadorId) {
              statsPartido.throws += stat.estadisticas?.throws || 0;
              statsPartido.hits += stat.estadisticas?.hits || 0;
              statsPartido.outs += stat.estadisticas?.outs || 0;
              statsPartido.catches += stat.estadisticas?.catches || 0;
            }
          });
        }
      });

      totalSets += setsConStats;
      totalThrows += statsPartido.throws;
      totalHits += statsPartido.hits;
      totalOuts += statsPartido.outs;
      totalCatches += statsPartido.catches;

      // Calculamos efectividad por partido (en %), o null si no hay throws
      const efectividad = statsPartido.throws > 0
        ? ((statsPartido.hits / statsPartido.throws) * 100).toFixed(2)
        : null;

      const hoc = statsPartido.outs > 0
        ? ((statsPartido.hits + statsPartido.catches) / statsPartido.outs).toFixed(2)
        : null;

      estadisticasPorPartido.push({
        _id: partido._id,
        nombrePartido: partido.nombrePartido,
        fecha: partido.fecha,
        liga: partido.liga,
        equipoLocal: partido.equipoLocal,
        equipoVisitante: partido.equipoVisitante,
        marcadorLocal: partido.marcadorLocal,
        marcadorVisitante: partido.marcadorVisitante,
        setsJugados: setsConStats,
        ...statsPartido,
        efectividad,
        hoc,
      });

      if (!ultimoPartido || new Date(partido.fecha) > new Date(ultimoPartido.fecha)) {
        ultimoPartido = partido;
      }
    });

    // Promedios
    const promedioThrows = totalPartidos ? (totalThrows / totalPartidos).toFixed(2) : 0;
    const promedioHits = totalPartidos ? (totalHits / totalPartidos).toFixed(2) : 0;
    const promedioOuts = totalPartidos ? (totalOuts / totalPartidos).toFixed(2) : 0;
    const promedioCatches = totalPartidos ? (totalCatches / totalPartidos).toFixed(2) : 0;
    const promedioSetsPorPartido = totalPartidos ? (totalSets / totalPartidos).toFixed(2) : 0;

    // Efectividad promedio general
    const efectividadPromedio = totalThrows > 0
      ? ((totalHits / totalThrows) * 100).toFixed(2)
      : null;

    const promedioHOC = totalOuts > 0
      ? ((totalHits + totalCatches) / totalOuts).toFixed(2)
      : null;

    res.json({
      totalPartidos,
      totalSets,
      totalThrows,
      totalHits,
      totalOuts,
      totalCatches,
      promedioThrows,
      promedioHits,
      promedioOuts,
      promedioCatches,
      promedioSetsPorPartido,
      efectividadPromedio,
      promedioHOC,
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

export const obtenerResumenEstadisticasEquipo = async (req, res) => {
  const { equipoId } = req.params;

  try {
    // Buscamos partidos donde el equipo haya jugado (local o visitante)
    const partidos = await Partido.find({
      $or: [
        { equipoLocal: equipoId },
        { equipoVisitante: equipoId }
      ]
    }).lean();

    let totalPartidos = partidos.length;
    let totalSets = 0;
    let totalThrows = 0, totalHits = 0, totalOuts = 0, totalCatches = 0;
    let ultimoPartido = null;
    const estadisticasPorPartido = [];

    partidos.forEach(partido => {
      let statsPartido = { throws: 0, hits: 0, outs: 0, catches: 0 };
      let setsConStats = 0;

      partido.sets.forEach(set => {
        // Filtramos stats solo de jugadores del equipo
        const statsEquipo = set.statsJugadoresSet.filter(stat => stat.equipo.toString() === equipoId);

        if (statsEquipo.length > 0) {
          setsConStats++;
          statsEquipo.forEach(stat => {
            statsPartido.throws += stat.estadisticas?.throws || 0;
            statsPartido.hits += stat.estadisticas?.hits || 0;
            statsPartido.outs += stat.estadisticas?.outs || 0;
            statsPartido.catches += stat.estadisticas?.catches || 0;
          });
        }
      });

      totalSets += setsConStats;
      totalThrows += statsPartido.throws;
      totalHits += statsPartido.hits;
      totalOuts += statsPartido.outs;
      totalCatches += statsPartido.catches;

      const efectividad = statsPartido.throws > 0
        ? ((statsPartido.hits / statsPartido.throws) * 100).toFixed(2)
        : null;

      const hoc = statsPartido.outs > 0
        ? ((statsPartido.hits + statsPartido.catches) / statsPartido.outs).toFixed(2)
        : null;

      estadisticasPorPartido.push({
        _id: partido._id,
        nombrePartido: partido.nombrePartido,
        fecha: partido.fecha,
        liga: partido.liga,
        equipoLocal: partido.equipoLocal,
        equipoVisitante: partido.equipoVisitante,
        marcadorLocal: partido.marcadorLocal,
        marcadorVisitante: partido.marcadorVisitante,
        setsJugados: setsConStats,
        ...statsPartido,
        efectividad,
        hoc,
      });

      if (!ultimoPartido || new Date(partido.fecha) > new Date(ultimoPartido.fecha)) {
        ultimoPartido = partido;
      }
    });

    const promedioThrows = totalPartidos ? (totalThrows / totalPartidos).toFixed(2) : 0;
    const promedioHits = totalPartidos ? (totalHits / totalPartidos).toFixed(2) : 0;
    const promedioOuts = totalPartidos ? (totalOuts / totalPartidos).toFixed(2) : 0;
    const promedioCatches = totalPartidos ? (totalCatches / totalPartidos).toFixed(2) : 0;
    const promedioSetsPorPartido = totalPartidos ? (totalSets / totalPartidos).toFixed(2) : 0;

    const efectividadPromedio = totalThrows > 0
      ? ((totalHits / totalThrows) * 100).toFixed(2)
      : null;

    const promedioHOC = totalOuts > 0
      ? ((totalHits + totalCatches) / totalOuts).toFixed(2)
      : null;

    res.json({
      totalPartidos,
      totalSets,
      totalThrows,
      totalHits,
      totalOuts,
      totalCatches,
      promedioThrows,
      promedioHits,
      promedioOuts,
      promedioCatches,
      promedioSetsPorPartido,
      efectividadPromedio,
      promedioHOC,
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
    console.error('Error en obtenerResumenEstadisticasEquipo:', error);
    res.status(500).json({ error: 'Error al obtener resumen de estadísticas del equipo' });
  }
};
