import Partido from '../models/Partido.js';

export async function obtenerResumenAnalisisPartido(req, res) {
  try {
    const { partidoId } = req.params;

    const partido = await Partido.findById(partidoId).lean();

    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }

    // Ejemplo: calcular total de lanzamientos y hits por equipo en todos los sets
    let resumen = {
      equipoLocal: { lanzamientos: 0, hits: 0 },
      equipoVisitante: { lanzamientos: 0, hits: 0 },
    };

    partido.sets.forEach(set => {
      set.statsJugadoresSet.forEach(stat => {
        if(stat.equipo.toString() === partido.equipoLocal.toString()) {
          resumen.equipoLocal.lanzamientos += stat.lanzamientos || 0;
          resumen.equipoLocal.hits += stat.hits || 0;
        } else if(stat.equipo.toString() === partido.equipoVisitante.toString()) {
          resumen.equipoVisitante.lanzamientos += stat.lanzamientos || 0;
          resumen.equipoVisitante.hits += stat.hits || 0;
        }
      });
    });

    // Se pueden agregar más cálculos: promedios, ratios, jugadores destacados, etc.

    res.json({ resumen });
  } catch (error) {
    console.error('Error al obtener análisis:', error);
    res.status(500).json({ error: error.message || 'Error en análisis.' });
  }
}
