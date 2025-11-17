// controllers/estadisticasController.js
import EstadisticasJugadorPartido from '../models/Jugador/EstadisticasJugadorPartido.js';
import EstadisticasEquipoPartido from '../models/Equipo/EstadisticasEquipoPartido.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import EquipoPartido from '../models/Equipo/EquipoPartido.js';
import logger from '../utils/logger.js';

/**
 * Obtiene el resumen de estadísticas para un jugador
 * Agrega todas las estadísticas de todos los partidos del jugador
 */
export async function obtenerResumenEstadisticasJugador(req, res) {
  try {
    const { jugadorId } = req.params;

    // Obtener todos los registros de JugadorPartido para este jugador
    const jugadorPartidos = await JugadorPartido.find({ jugador: jugadorId })
      .select('_id')
      .lean();

    if (jugadorPartidos.length === 0) {
      return res.json({
        jugador: jugadorId,
        partidosJugados: 0,
        totales: {
          throws: 0,
          hits: 0,
          outs: 0,
          catches: 0,
        },
      });
    }

    const jugadorPartidoIds = jugadorPartidos.map((jp) => jp._id);

    // Agregar estadísticas de todos los partidos
    const resumen = await EstadisticasJugadorPartido.aggregate([
      {
        $match: {
          jugadorPartido: { $in: jugadorPartidoIds },
        },
      },
      {
        $group: {
          _id: null,
          throws: { $sum: '$throws' },
          hits: { $sum: '$hits' },
          outs: { $sum: '$outs' },
          catches: { $sum: '$catches' },
          partidosJugados: { $sum: 1 },
        },
      },
    ]);

    if (resumen.length === 0) {
      return res.json({
        jugador: jugadorId,
        partidosJugados: 0,
        totales: {
          throws: 0,
          hits: 0,
          outs: 0,
          catches: 0,
        },
      });
    }

    const totales = resumen[0];

    res.json({
      jugador: jugadorId,
      partidosJugados: totales.partidosJugados,
      totales: {
        throws: totales.throws || 0,
        hits: totales.hits || 0,
        outs: totales.outs || 0,
        catches: totales.catches || 0,
      },
    });
  } catch (error) {
    logger.error('Error al obtener resumen de estadísticas del jugador:', error);
    res.status(500).json({ error: error.message || 'Error al obtener resumen de estadísticas.' });
  }
}

/**
 * Obtiene el resumen de estadísticas para un equipo
 * Agrega todas las estadísticas de todos los partidos del equipo
 */
export async function obtenerResumenEstadisticasEquipo(req, res) {
  try {
    const { equipoId } = req.params;

    // Obtener todos los registros de EquipoPartido para este equipo
    const equipoPartidos = await EquipoPartido.find({ equipo: equipoId })
      .select('_id')
      .lean();

    if (equipoPartidos.length === 0) {
      return res.json({
        equipo: equipoId,
        partidosJugados: 0,
        totales: {
          throws: 0,
          hits: 0,
          outs: 0,
          catches: 0,
        },
      });
    }

    const equipoPartidoIds = equipoPartidos.map((ep) => ep._id);

    // Agregar estadísticas de todos los partidos
    const resumen = await EstadisticasEquipoPartido.aggregate([
      {
        $match: {
          equipoPartido: { $in: equipoPartidoIds },
        },
      },
      {
        $group: {
          _id: null,
          throws: { $sum: '$throws' },
          hits: { $sum: '$hits' },
          outs: { $sum: '$outs' },
          catches: { $sum: '$catches' },
          partidosJugados: { $sum: 1 },
        },
      },
    ]);

    if (resumen.length === 0) {
      return res.json({
        equipo: equipoId,
        partidosJugados: 0,
        totales: {
          throws: 0,
          hits: 0,
          outs: 0,
          catches: 0,
        },
      });
    }

    const totales = resumen[0];

    res.json({
      equipo: equipoId,
      partidosJugados: totales.partidosJugados,
      totales: {
        throws: totales.throws || 0,
        hits: totales.hits || 0,
        outs: totales.outs || 0,
        catches: totales.catches || 0,
      },
    });
  } catch (error) {
    logger.error('Error al obtener resumen de estadísticas del equipo:', error);
    res.status(500).json({ error: error.message || 'Error al obtener resumen de estadísticas.' });
  }
}
