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

    // Ordenamiento principal
    const sorted = [...participaciones].sort((a, b) => {
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

    // Actualizar posiciones en la base de datos
    for (let i = 0; i < sorted.length; i++) {
      const pos = i + 1;
      const id = sorted[i]._id;
      
      const updateData = { posicion: pos };
      
      // Aplicar reglas de clasificado/eliminado basadas en 'progresion'
      if (config.progresion) {
        const { clasificanDirecto } = config.progresion;
        if (clasificanDirecto && pos <= clasificanDirecto) {
          updateData.clasificado = true;
          updateData.eliminado = false;
        } else {
          updateData.clasificado = false;
          // Aquí podríamos marcar como eliminado si no hay más chances
        }
      }

      await ParticipacionFase.findByIdAndUpdate(id, updateData);
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
    const fase = await Fase.findById(faseId).populate('configuracion.progresion.destinoGanadores configuracion.progresion.destinoPerdedores');
    if (!fase || !fase.configuracion?.progresion) return;

    const { progresion } = fase.configuracion;
    const standings = await this.calculateStandings(faseId);

    // TODO: Implementar lógica de creación de ParticipacionFase en la fase destino
    // y asignación de seeds si es un playoff.
  }
};
