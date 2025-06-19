// server/controllers/estadisticasController.js
import Partido from '../models/Partido.js';

// Obtener estadísticas de un partido (por ejemplo, todos los sets con stats)
export async function obtenerEstadisticasPartido(req, res) {
  try {
    const { partidoId } = req.params;

    const partido = await Partido.findById(partidoId)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo')
      .lean();

    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }

    // Retornamos los sets con sus estadísticas
    res.json({ sets: partido.sets });
  } catch (error) {
    console.error('Error al obtener estadísticas del partido:', error);
    res.status(500).json({ error: error.message || 'Error al obtener estadísticas.' });
  }
}

// Actualizar o agregar estadísticas específicas para un jugador en un set
export async function actualizarEstadisticaJugadorSet(req, res) {
  try {
    const { partidoId, numeroSet, jugadorId } = req.params;
    const { estadistica } = req.body; // un objeto con las stats a actualizar o agregar

    const partido = await Partido.findById(partidoId);
    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }

    const setIndex = partido.sets.findIndex(s => s.numeroSet === parseInt(numeroSet));
    if (setIndex === -1) {
      return res.status(404).json({ error: `Set número ${numeroSet} no encontrado.` });
    }

    const statsJugadores = partido.sets[setIndex].statsJugadoresSet || [];

    // Buscar si ya hay stats para ese jugador
    const statsIndex = statsJugadores.findIndex(s => s.jugador.toString() === jugadorId);

    if (statsIndex === -1) {
      // agregar nuevo objeto con propiedad estadisticas
      statsJugadores.push({ jugador: jugadorId, estadisticas: estadistica });
    } else {
      // actualizar la propiedad estadisticas con los nuevos valores
      statsJugadores[statsIndex].estadisticas = estadistica;
    }

    partido.sets[setIndex].statsJugadoresSet = statsJugadores;
    await partido.save();

    res.json({ mensaje: 'Estadísticas actualizadas correctamente.', statsJugadoresSet: statsJugadores });
  } catch (error) {
    console.error('Error al actualizar estadística de jugador:', error);
    res.status(400).json({ error: error.message || 'Error al actualizar estadística.' });
  }
}
