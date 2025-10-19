import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';
import EstadisticasJugadorPartido from '../models/Jugador/EstadisticasJugadorPartido.js';
import EstadisticasEquipoPartido from '../models/Equipo/EstadisticasEquipoPartido.js';
import JugadorPartido from '../models/Partido/JugadorPartido.js';

/**
 * Actualiza las estadísticas totales de un jugador en un partido
 * sumando todas sus EstadisticasJugadorSet
 */
export async function actualizarEstadisticasJugadorPartido(jugadorPartidoId, creadoPor) {
  try {
    console.log('🔄 Actualizando estadísticas totales para jugadorPartido:', jugadorPartidoId);
    
    // Obtener todas las estadísticas por set de este jugador
    const estadisticasPorSet = await EstadisticasJugadorSet.find({
      jugadorPartido: jugadorPartidoId
    });
    
    if (estadisticasPorSet.length === 0) {
      console.log('⚠️ No hay estadísticas por set para este jugador');
      return null;
    }
    
    // Sumar todas las estadísticas
    const totales = estadisticasPorSet.reduce((acc, stat) => ({
      throws: acc.throws + (stat.throws || 0),
      hits: acc.hits + (stat.hits || 0),
      outs: acc.outs + (stat.outs || 0),
      catches: acc.catches + (stat.catches || 0)
    }), { throws: 0, hits: 0, outs: 0, catches: 0 });
    
    console.log('📊 Totales calculados:', totales);
    
    // Actualizar o crear EstadisticasJugadorPartido
    const estadisticasPartido = await EstadisticasJugadorPartido.findOneAndUpdate(
      { jugadorPartido: jugadorPartidoId },
      {
        throws: totales.throws,
        hits: totales.hits,
        outs: totales.outs,
        catches: totales.catches,
        creadoPor
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ EstadisticasJugadorPartido actualizado:', estadisticasPartido._id);
    
    return estadisticasPartido;
  } catch (error) {
    console.error('❌ Error actualizando estadísticas de jugador partido:', error);
    throw error;
  }
}

/**
 * Actualiza las estadísticas totales de un equipo en un partido
 * sumando todas las EstadisticasJugadorPartido de sus jugadores
 */
export async function actualizarEstadisticasEquipoPartido(partidoId, equipoId, creadoPor) {
  try {
    console.log('🔄 Actualizando estadísticas totales del equipo:', equipoId, 'en partido:', partidoId);
    
    // Obtener todos los jugadores de este equipo en este partido
    const jugadoresPartido = await JugadorPartido.find({
      partido: partidoId,
      equipo: equipoId
    }).select('_id');
    
    if (jugadoresPartido.length === 0) {
      console.log('⚠️ No hay jugadores para este equipo en este partido');
      return null;
    }
    
    const jugadorPartidoIds = jugadoresPartido.map(jp => jp._id);
    
    // Obtener estadísticas de todos los jugadores del equipo
    const estadisticasJugadores = await EstadisticasJugadorPartido.find({
      jugadorPartido: { $in: jugadorPartidoIds }
    });
    
    if (estadisticasJugadores.length === 0) {
      console.log('⚠️ No hay estadísticas de jugadores para este equipo');
      return null;
    }
    
    // Sumar todas las estadísticas
    const totales = estadisticasJugadores.reduce((acc, stat) => ({
      throws: acc.throws + (stat.throws || 0),
      hits: acc.hits + (stat.hits || 0),
      outs: acc.outs + (stat.outs || 0),
      catches: acc.catches + (stat.catches || 0)
    }), { throws: 0, hits: 0, outs: 0, catches: 0 });
    
    console.log('📊 Totales del equipo calculados:', totales);
    
    // Actualizar o crear EstadisticasEquipoPartido
    const estadisticasEquipo = await EstadisticasEquipoPartido.findOneAndUpdate(
      { partido: partidoId, equipo: equipoId },
      {
        throws: totales.throws,
        hits: totales.hits,
        outs: totales.outs,
        catches: totales.catches,
        calculado: true,
        creadoPor
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ EstadisticasEquipoPartido actualizado:', estadisticasEquipo._id);
    
    return estadisticasEquipo;
  } catch (error) {
    console.error('❌ Error actualizando estadísticas de equipo partido:', error);
    throw error;
  }
}

/**
 * Recalcula todas las estadísticas agregadas para un set específico
 * Útil cuando se actualizan estadísticas de un set
 */
export async function recalcularEstadisticasDeSet(setId) {
  try {
    console.log('🔄 Recalculando estadísticas agregadas para set:', setId);
    
    // Obtener todas las estadísticas del set
    const estadisticasSet = await EstadisticasJugadorSet.find({ set: setId })
      .populate('jugadorPartido');
    
    if (estadisticasSet.length === 0) {
      console.log('⚠️ No hay estadísticas para este set');
      return;
    }
    
    // Obtener jugadorPartidoIds y equipos únicos
    const jugadoresPartidoSet = new Set();
    const equiposPartidoMap = new Map(); // equipoId -> partidoId
    
    for (const stat of estadisticasSet) {
      jugadoresPartidoSet.add(stat.jugadorPartido._id.toString());
      
      const jugadorPartido = await JugadorPartido.findById(stat.jugadorPartido).populate('partido');
      if (jugadorPartido) {
        equiposPartidoMap.set(
          stat.equipo.toString(),
          jugadorPartido.partido._id.toString()
        );
      }
    }
    
    // Obtener el creadoPor del primer registro
    const creadoPor = estadisticasSet[0].creadoPor;
    
    // Actualizar estadísticas de cada jugador
    for (const jugadorPartidoId of jugadoresPartidoSet) {
      await actualizarEstadisticasJugadorPartido(jugadorPartidoId, creadoPor);
    }
    
    // Actualizar estadísticas de cada equipo
    for (const [equipoId, partidoId] of equiposPartidoMap) {
      await actualizarEstadisticasEquipoPartido(partidoId, equipoId, creadoPor);
    }
    
    console.log('✅ Estadísticas agregadas recalculadas correctamente');
  } catch (error) {
    console.error('❌ Error recalculando estadísticas:', error);
    throw error;
  }
}
