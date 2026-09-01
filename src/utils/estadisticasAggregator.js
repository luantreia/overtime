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

    // Obtener todas las estadísticas por set de este jugador.
    //
    // Se excluyen las rechazadas: antes se sumaban igual, así que rechazar una
    // solicitud solo escondía la fila de origen y dejaba su aporte dentro de los
    // totales para siempre.
    const estadisticasPorSet = await EstadisticasJugadorSet.find({
      jugadorPartido: jugadorPartidoId,
      estadoPublicacion: { $ne: 'rechazada' },
    });

    if (estadisticasPorSet.length === 0) {
      console.log('⚠️ No hay estadísticas por set computables para este jugador');
      // Importante: no cortamos acá. Si el jugador tenía totales de una carga
      // anterior que después se rechazó, hay que bajarlos a cero en vez de
      // dejar el registro viejo intacto.
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
    // Se excluyen las rechazadas, igual que en los totales del jugador.
    const estadisticasJugadores = await EstadisticasJugadorPartido.find({
      jugadorPartido: { $in: jugadorPartidoIds },
      estadoPublicacion: { $ne: 'rechazada' },
    });
    
    if (estadisticasJugadores.length === 0) {
      // No cortamos: si lo que había quedó rechazado, los totales del equipo
      // tienen que bajar a cero en vez de conservar la carga anterior.
      console.log('⚠️ No hay estadísticas computables de jugadores para este equipo');
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
 * Rehace la cadena de agregados que cuelga de un JugadorPartido: primero sus
 * totales del partido y después los de su equipo.
 *
 * Se usa cuando cambia algo que altera las sumas sin pasar por la ruta de
 * captura: aprobar una propuesta de estadísticas o rechazar una carga previa.
 *
 * No lanza: es una reconciliación, y romper el flujo que la llamó (por ejemplo
 * un rechazo que ya se guardó) sería peor que un total desfasado.
 */
export async function recalcularAgregadosDeJugadorPartido(jugadorPartidoId, creadoPor) {
  try {
    const jp = await JugadorPartido.findById(jugadorPartidoId).select('partido equipo').lean();
    if (!jp) return null;

    await actualizarEstadisticasJugadorPartido(jugadorPartidoId, creadoPor, false);

    if (jp.partido && jp.equipo) {
      await actualizarEstadisticasEquipoPartido(jp.partido, jp.equipo, creadoPor);
    }

    return jp;
  } catch (error) {
    console.error('❌ Error recalculando agregados de jugadorPartido:', jugadorPartidoId, error);
    return null;
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

    // Verificar que el partido existe
    const Partido = (await import('../models/Partido/Partido.js')).default;
    const partido = await Partido.findById(partidoId);
    if (!partido) {
      throw new Error('Partido no encontrado');
    }

    // Verificar que el partido tenga sets
    const SetPartido = (await import('../models/Partido/SetPartido.js')).default;
    const setsCount = await SetPartido.countDocuments({ partido: partidoId });
    if (setsCount === 0) {
      throw new Error('El partido no tiene sets registrados. No se pueden calcular estadísticas automáticas.');
    }

    // Primero obtener los JugadorPartido de este partido
    const JugadorPartido = (await import('../models/Jugador/JugadorPartido.js')).default;
    const jugadoresDelPartido = await JugadorPartido.find({ partido: partidoId }).select('_id');
    const jugadorPartidoIds = jugadoresDelPartido.map(jp => jp._id);

    // Obtener todas las estadísticas manuales del partido
    const estadisticasManuales = await EstadisticasJugadorPartido.find({
      jugadorPartido: { $in: jugadorPartidoIds },
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
        console.log('🔄 Procesando estadística:', {
          id: estadistica._id,
          jugadorPartido: estadistica.jugadorPartido,
          tipoJugadorPartido: typeof estadistica.jugadorPartido,
          esObjeto: typeof estadistica.jugadorPartido === 'object'
        });

        // Determinar el ID correcto
        let jugadorPartidoId;
        if (typeof estadistica.jugadorPartido === 'object' && estadistica.jugadorPartido._id) {
          jugadorPartidoId = estadistica.jugadorPartido._id.toString();
        } else if (typeof estadistica.jugadorPartido === 'string') {
          jugadorPartidoId = estadistica.jugadorPartido;
        } else {
          throw new Error(`ID de jugadorPartido inválido: ${estadistica.jugadorPartido}`);
        }

        console.log('🎯 ID extraído:', jugadorPartidoId);

        // Intentar actualizar con datos de sets (esto debería calcular los totales automáticamente)
        const resultado = await actualizarEstadisticasJugadorPartido(
          jugadorPartidoId,
          creadoPor,
          true // Forzar actualización para sobreescribir las manuales
        );

        if (resultado) {
          convertidas++;
          console.log(`✅ Convertida estadística manual para jugador: ${jugadorPartidoId}`);
        }
      } catch (error) {
        console.error(`❌ Error convirtiendo estadística para jugador ${estadistica._id}:`, error);
        throw error; // Re-throw para que se maneje arriba
      }
    }

    // Después de convertir todas las estadísticas de jugadores, actualizar estadísticas de equipos
    try {
      // Obtener los equipos del partido con populate
      const Partido = (await import('../models/Partido/Partido.js')).default;
      const partido = await Partido.findById(partidoId).populate('equipoLocal equipoVisitante');
      if (partido) {
        console.log('🏆 Equipos del partido:', {
          equipoLocal: partido.equipoLocal,
          equipoVisitante: partido.equipoVisitante
        });

        if (partido.equipoLocal && partido.equipoLocal._id) {
          await actualizarEstadisticasEquipoPartido(partidoId, partido.equipoLocal._id.toString(), creadoPor);
        }
        if (partido.equipoVisitante && partido.equipoVisitante._id) {
          await actualizarEstadisticasEquipoPartido(partidoId, partido.equipoVisitante._id.toString(), creadoPor);
        }
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
