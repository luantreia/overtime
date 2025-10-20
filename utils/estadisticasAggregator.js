import EstadisticasJugadorSet from '../models/Jugador/EstadisticasJugadorSet.js';
import EstadisticasJugadorPartido from '../models/Jugador/EstadisticasJugadorPartido.js';
import EstadisticasEquipoPartido from '../models/Equipo/EstadisticasEquipoPartido.js';
import JugadorPartido from '../models/Jugador/JugadorPartido.js';
import EquipoPartido from '../models/Equipo/EquipoPartido.js';

/**
 * Actualiza las estadísticas totales de un jugador en un partido
 * sumando todas sus EstadisticasJugadorSet
 * @param {string} jugadorPartidoId - ID del JugadorPartido
 * @param {string} creadoPor - Usuario que realiza la acción
 * @param {boolean} forzarActualizacion - Si true, sobrescribe incluso estadísticas manuales
 */
export async function actualizarEstadisticasJugadorPartido(jugadorPartidoId, creadoPor, forzarActualizacion = false) {
  try {
    console.log('🔄 Actualizando estadísticas totales para jugadorPartido:', jugadorPartidoId);

    // Verificar si ya existen estadísticas manuales
    const estadisticasExistentes = await EstadisticasJugadorPartido.findOne({
      jugadorPartido: jugadorPartidoId
    });

    if (estadisticasExistentes && estadisticasExistentes.tipoCaptura === 'manual' && !forzarActualizacion) {
      console.log('⏭️ Estadísticas manuales detectadas - no se sobrescriben automáticamente');
      return estadisticasExistentes;
    }

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

    // Determinar el tipo de captura
    let tipoCaptura = 'automatica';
    let fuente = 'calculo-sets';

    if (estadisticasExistentes && estadisticasExistentes.tipoCaptura === 'manual' && forzarActualizacion) {
      tipoCaptura = 'mixta'; // Era manual pero ahora se mezcló con sets
      fuente = 'calculo-sets-sobre-manual';
    }

    // Actualizar o crear EstadisticasJugadorPartido
    const estadisticasPartido = await EstadisticasJugadorPartido.findOneAndUpdate(
      { jugadorPartido: jugadorPartidoId },
      {
        throws: totales.throws,
        hits: totales.hits,
        outs: totales.outs,
        catches: totales.catches,
        tipoCaptura,
        fuente,
        ultimaActualizacion: new Date(),
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
 * Crea estadísticas iniciales para partidos existentes que no tienen estadísticas
 * Útil para migrar datos existentes
 */
export async function poblarEstadisticasIniciales() {
  try {
    console.log('🔄 Poblando estadísticas iniciales...');

    // 1. Obtener todos los JugadorPartido
    const todosJugadoresPartido = await JugadorPartido.find({});
    console.log(`📊 Total de JugadorPartido encontrados: ${todosJugadoresPartido.length}`);

    // Obtener IDs de jugadores que ya tienen estadísticas
    const jugadoresConStats = await EstadisticasJugadorPartido.distinct('jugadorPartido');
    console.log(`📊 Jugadores que ya tienen estadísticas: ${jugadoresConStats.length}`);

    // Filtrar jugadores sin estadísticas
    const jugadoresSinStats = todosJugadoresPartido.filter(
      jugador => !jugadoresConStats.some(id => id.equals(jugador._id))
    );

    console.log(`📊 Jugadores sin estadísticas: ${jugadoresSinStats.length}`);

    // Crear estadísticas iniciales para jugadores sin stats
    for (const jugador of jugadoresSinStats) {
      try {
        const estadisticasIniciales = new EstadisticasJugadorPartido({
          jugadorPartido: jugador._id,
          throws: 0,
          hits: 0,
          outs: 0,
          catches: 0,
          creadoPor: jugador.creadoPor || 'system',
        });

        await estadisticasIniciales.save();
        console.log(`✅ Estadísticas iniciales creadas para jugador: ${jugador._id}`);
      } catch (error) {
        console.error(`❌ Error creando estadísticas para jugador ${jugador._id}:`, error);
      }
    }

    // 2. Obtener todos los EquipoPartido
    const todosEquiposPartido = await EquipoPartido.find({});
    console.log(`📊 Total de EquipoPartido encontrados: ${todosEquiposPartido.length}`);

    // Crear estadísticas iniciales para equipos (más simple)
    for (const equipoPartido of todosEquiposPartido) {
      try {
        // Verificar si ya existe
        const existe = await EstadisticasEquipoPartido.findOne({
          partido: equipoPartido.partido,
          equipo: equipoPartido.equipo
        });

        if (!existe) {
          const estadisticasIniciales = new EstadisticasEquipoPartido({
            partido: equipoPartido.partido,
            equipo: equipoPartido.equipo,
            throws: 0,
            hits: 0,
            outs: 0,
            catches: 0,
            efectividad: 0,
            jugadores: 0,
            creadoPor: equipoPartido.creadoPor || 'system',
          });

          await estadisticasIniciales.save();
          console.log(`✅ Estadísticas iniciales creadas para equipo: ${equipoPartido.equipo} en partido: ${equipoPartido.partido}`);
        }
      } catch (error) {
        console.error(`❌ Error creando estadísticas para equipo ${equipoPartido.equipo}:`, error);
      }
    }

    console.log('✅ Poblado de estadísticas iniciales completado');
  } catch (error) {
    console.error('❌ Error en poblado de estadísticas iniciales:', error);
    throw error;
  }
}

/**
 * Convierte estadísticas manuales a automáticas para todos los jugadores de un partido
 * Útil cuando se quiere sobreescribir estadísticas manuales con datos calculados de sets
 */
export async function convertirEstadisticasManualesAAutomaticas(partidoId, creadoPor) {
  try {
    console.log('🔄 Convirtiendo estadísticas manuales a automáticas para partido:', partidoId);

    // Obtener todas las estadísticas manuales del partido
    const estadisticasManuales = await EstadisticasJugadorPartido.find({
      'jugadorPartido.partido': partidoId,
      tipoCaptura: 'manual'
    }).populate('jugadorPartido');

    if (estadisticasManuales.length === 0) {
      console.log('ℹ️ No hay estadísticas manuales para convertir en este partido');
      return { convertidas: 0, mensaje: 'No hay estadísticas manuales para convertir' };
    }

    console.log(`📊 Encontradas ${estadisticasManuales.length} estadísticas manuales para convertir`);

    let convertidas = 0;

    for (const estadistica of estadisticasManuales) {
      try {
        // Intentar actualizar con datos de sets (esto debería calcular los totales automáticamente)
        const resultado = await actualizarEstadisticasJugadorPartido(
          estadistica.jugadorPartido._id || estadistica.jugadorPartido,
          creadoPor,
          true // Forzar actualización para sobreescribir las manuales
        );

        if (resultado) {
          convertidas++;
          console.log(`✅ Convertida estadística manual para jugador: ${estadistica.jugadorPartido._id}`);
        }
      } catch (error) {
        console.error(`❌ Error convirtiendo estadística para jugador ${estadistica.jugadorPartido._id}:`, error);
      }
    }

    // Después de convertir todas las estadísticas de jugadores, actualizar estadísticas de equipos
    try {
      // Obtener los equipos del partido
      const Partido = (await import('../models/Partido.js')).default;
      const partido = await Partido.findById(partidoId);
      if (partido) {
        await actualizarEstadisticasEquipoPartido(partidoId, partido.equipoLocal._id, creadoPor);
        await actualizarEstadisticasEquipoPartido(partidoId, partido.equipoVisitante._id, creadoPor);
        console.log('✅ Estadísticas de equipos actualizadas después de conversión');
      }
    } catch (error) {
      console.error('❌ Error actualizando estadísticas de equipos:', error);
    }

    console.log(`✅ Conversión completada: ${convertidas} de ${estadisticasManuales.length} estadísticas convertidas`);

    return {
      convertidas,
      total: estadisticasManuales.length,
      mensaje: `Se convirtieron ${convertidas} de ${estadisticasManuales.length} estadísticas manuales a automáticas`
    };

  } catch (error) {
    console.error('❌ Error convirtiendo estadísticas manuales a automáticas:', error);
    throw error;
  }
}
