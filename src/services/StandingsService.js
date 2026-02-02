import ParticipacionFase from '../models/Equipo/ParticipacionFase.js';
import Fase from '../models/Competencia/Fase.js';
import Partido from '../models/Partido/Partido.js';

/**
 * Servicio para gestionar las tablas de posiciones y progresiones de las competencias.
 */
export const StandingsService = {
  
  /**
   * Calcula y ordena la tabla de posiciones de una fase.
   * Aplica criterios de desempate configurados en la fase.
   */
  async calculateStandings(faseId) {
    const fase = await Fase.findById(faseId).lean();
    if (!fase) throw new Error('Fase no encontrada');

    const participaciones = await ParticipacionFase.find({ fase: faseId })
      .populate('participacionTemporada')
      .lean();

    const config = fase.configuracion || {};
    const criterios = config.criteriosDesempate || ['PUNTOS', 'DIF_SETS', 'CARA_A_CARA', 'DIF_PUNTOS'];

    // Obtener todos los partidos para el desempate "cara a cara"
    const partidos = await Partido.find({ fase: faseId, estado: 'finalizado' }).lean();

    // Función para procesar y ordenar un grupo de participaciones
    const ordenarGrupo = (lista) => {
      return [...lista].sort((a, b) => {
        for (const criterio of criterios) {
          if (criterio === 'PUNTOS') {
            if (b.puntos !== a.puntos) return b.puntos - a.puntos;
          }
          if (criterio === 'DIF_SETS') {
            const difA = a.statsSets?.diferencia || 0;
            const difB = b.statsSets?.diferencia || 0;
            if (difB !== difA) return difB - difA;
          }
          if (criterio === 'DIF_PUNTOS') {
            if (b.diferenciaPuntos !== a.diferenciaPuntos) return b.diferenciaPuntos - a.diferenciaPuntos;
          }
          if (criterio === 'CARA_A_CARA') {
            const resultado = this._compareHeadToHead(a, b, partidos);
            if (resultado !== 0) return resultado;
          }
          if (criterio === 'SETS_FAVOR') {
            const favorA = a.statsSets?.ganados || 0;
            const favorB = b.statsSets?.ganados || 0;
            if (favorB !== favorA) return favorB - favorA;
          }
        }
        return 0;
      });
    };

    let sorted = [];
    
    // Si la fase es de tipo 'grupo', ordenamos CADA GRUPO INDEPENDIENTEMENTE
    if (fase.tipo === 'grupo') {
      const grupos = {};
      participaciones.forEach(p => {
        const g = p.grupo || 'General';
        if (!grupos[g]) grupos[g] = [];
        grupos[g].push(p);
      });

      // Ordenamos cada grupo y concatenamos
      Object.keys(grupos).sort().forEach(g => {
        const sortedGrupo = ordenarGrupo(grupos[g]);
        // Asignamos posición relativa dentro del grupo para guardar
        sortedGrupo.forEach((p, idx) => {
          p.posicionRelativa = idx + 1;
        });
        sorted = sorted.concat(sortedGrupo);
      });
    } else {
      sorted = ordenarGrupo(participaciones);
    }

    // Actualizar posiciones en la base de datos
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const pos = p.posicionRelativa || (i + 1);
      const id = p._id;
      
      const updateData = { posicion: pos };
      
      // Aplicar reglas de clasificado/eliminado basadas en 'progresion'
      if (config.progresion) {
        const { clasificanDirecto } = config.progresion;
        if (clasificanDirecto && pos <= clasificanDirecto) {
          updateData.clasificado = true;
          updateData.eliminado = false;
        } else {
          updateData.clasificado = false;
        }
      }

      await ParticipacionFase.findByIdAndUpdate(id, updateData);
      // Actualizamos el objeto local para que processProgression lo use bien
      p.posicion = pos;
    }

    return sorted;
  },

  /**
   * Compara dos equipos basándose en sus enfrentamientos directos.
   */
  _compareHeadToHead(a, b, partidos) {
    const enfrentamientos = partidos.filter(p => 
      (p.equipoLocal?.toString() === a.participacionTemporada.equipo?.toString() && p.equipoVisitante?.toString() === b.participacionTemporada.equipo?.toString()) ||
      (p.equipoLocal?.toString() === b.participacionTemporada.equipo?.toString() && p.equipoVisitante?.toString() === a.participacionTemporada.equipo?.toString())
    );

    if (enfrentamientos.length === 0) return 0;

    let puntosA = 0;
    let puntosB = 0;

    enfrentamientos.forEach(p => {
      const isALocal = p.equipoLocal?.toString() === a.participacionTemporada.equipo?.toString();
      const marcadorA = isALocal ? p.marcadorLocal : p.marcadorVisitante;
      const marcadorB = isALocal ? p.marcadorVisitante : p.marcadorLocal;

      if (marcadorA > marcadorB) puntosA += 3;
      else if (marcadorB > marcadorA) puntosB += 3;
      else { puntosA += 1; puntosB += 1; }
    });

    return puntosB - puntosA;
  },

  /**
   * Procesa el paso de equipos a la siguiente fase.
   * Útil para Copas, Playoffs y ascensos.
   */
  async processProgression(faseId) {
    const fase = await Fase.findById(faseId);
    if (!fase) throw new Error('Fase no encontrada');

    const config = fase.configuracion || {};
    const { progresion } = config;
    if (!progresion) return { mensaje: 'No hay configuración de progresión' };

    // Calculamos standings finales
    const standings = await this.calculateStandings(faseId);

    const resultados = { ganadores: 0, perdedores: 0, errores: [] };

    // 1. Procesar Ganadores (Clasificados directos)
    if (progresion.destinoGanadores && progresion.clasificanDirecto > 0) {
      const ganadores = standings.filter(p => p.posicion <= progresion.clasificanDirecto);
      
      // Obtener semillas ya ocupadas en el destino para no sobreescribir invitados
      const ocupados = await ParticipacionFase.find({ fase: progresion.destinoGanadores, seed: { $ne: null } }).select('seed').lean();
      const seedsOcupados = ocupados.map(o => o.seed);

      for (const p of ganadores) {
        try {
          const ptId = p.participacionTemporada?._id || p.participacionTemporada;
          if (!ptId) continue;

          // Verificar si ya existe en la fase destino
          const existe = await ParticipacionFase.findOne({ 
            participacionTemporada: ptId, 
            fase: progresion.destinoGanadores 
          });

          if (!existe) {
            let seed = null;
            if (progresion.estrategiaSembrado === 'posicion_directa') {
              // Si es por grupos, el seed es Posicion + Offset por Grupo
              // Ej: Pos 1 Grupo A = Seed 1, Pos 1 Grupo B = Seed 2...
              if (fase.tipo === 'grupo') {
                const gruposOrdenados = [...new Set(standings.map(s => s.grupo || 'General'))].sort();
                const indexGrupo = gruposOrdenados.indexOf(p.grupo || 'General');
                seed = (p.posicion - 1) * gruposOrdenados.length + (indexGrupo + 1);
              } else {
                seed = p.posicion;
              }

              // Si la semilla está ocupada por un invitado, buscamos la siguiente libre
              while (seedsOcupados.includes(seed)) {
                seed++;
              }
            }

            await ParticipacionFase.create({
              participacionTemporada: ptId,
              fase: progresion.destinoGanadores,
              seed: seed
            });
            seedsOcupados.push(seed);
            resultados.ganadores++;
          }
        } catch (err) {
          resultados.errores.push(`Error con ganador ${p._id}: ${err.message}`);
        }
      }
    }

    // 2. Procesar Perdedores (Aquellos que no clasificaron directo, ej. a Copa de Plata)
    if (progresion.destinoPerdedores && progresion.clasificanDirecto > 0) {
      const perdedores = standings.filter(p => p.posicion > progresion.clasificanDirecto);

      for (const p of perdedores) {
        try {
          const ptId = p.participacionTemporada?._id || p.participacionTemporada;
          if (!ptId) continue;

          const existe = await ParticipacionFase.findOne({ 
            participacionTemporada: ptId, 
            fase: progresion.destinoPerdedores 
          });

          if (!existe) {
            await ParticipacionFase.create({
              participacionTemporada: ptId,
              fase: progresion.destinoPerdedores
            });
            resultados.perdedores++;
          }
        } catch (err) {
          resultados.errores.push(`Error con perdedor ${p._id}: ${err.message}`);
        }
      }
    }

    // Marcar fase como finalizada
    fase.estado = 'finalizada';
    await fase.save();

    console.log(`[PROGRESION] Fase ${faseId} finalizada. Ganadores: ${resultados.ganadores}, Perdedores: ${resultados.perdedores}`);
    return resultados;
  }
};
