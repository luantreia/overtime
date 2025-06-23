// controllers/estadisticasController.js
import Partido from '../models/Partido.js';

export const obtenerResumenEstadisticasJugador = async (req, res) => {
  const { jugadorId } = req.params;

  try {
    // Buscar partidos donde participó el jugador
    // y acumular estadísticas por jugador

    // Ejemplo simplificado: buscar partidos que tengan sets con stats del jugador
    const partidos = await Partido.find({
      'sets.statsJugadoresSet.jugador': jugadorId
    }).lean();

    let totalPartidos = partidos.length;
    let totalThrows = 0, totalHits = 0, totalOuts = 0, totalCatches = 0;
    let ultimoPartido = null;

    partidos.forEach((partido) => {
      // Buscar sets con stats del jugador
      partido.sets.forEach(set => {
        set.statsJugadoresSet.forEach(stat => {
          if (stat.jugador.toString() === jugadorId) {
            totalThrows += stat.estadisticas?.throws || 0;
            totalHits += stat.estadisticas?.hits || 0;
            totalOuts += stat.estadisticas?.outs || 0;
            totalCatches += stat.estadisticas?.catches || 0;
          }
        });
      });

      // Último partido basado en fecha
      if (!ultimoPartido || new Date(partido.fecha) > new Date(ultimoPartido.fecha)) {
        ultimoPartido = partido;
      }
    });

    // Opcional: promedio por partido
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
      } : null
    });
  } catch (error) {
    console.error('Error en obtenerResumenEstadisticasJugador:', error);
    res.status(500).json({ error: 'Error al obtener resumen de estadísticas del jugador' });
  }
};
