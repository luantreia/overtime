export async function actualizarParticipacionFase(equipoCompetenciaId, faseId) {
  // 1. Buscar partidos finalizados de esa fase donde participe el equipo
  // (Suponiendo que el partido tiene referencia a fase, o a competencia que tiene fases)
  const partidos = await Partido.find({
    fase: faseId,
    estado: 'finalizado',
    $or: [{ equipoLocal: equipoCompetenciaId }, { equipoVisitante: equipoCompetenciaId }]
  }).lean();

  // 2. Calcular estadisticas sumando resultados
  let puntos = 0,
      partidosJugados = 0,
      partidosGanados = 0,
      partidosPerdidos = 0,
      partidosEmpatados = 0,
      diferenciaPuntos = 0;

  for (const p of partidos) {
    partidosJugados++;
    const esLocal = p.equipoLocal.toString() === equipoCompetenciaId.toString();
    const marcadorEquipo = esLocal ? p.marcadorLocal : p.marcadorVisitante;
    const marcadorRival = esLocal ? p.marcadorVisitante : p.marcadorLocal;

    diferenciaPuntos += marcadorEquipo - marcadorRival;

    if (marcadorEquipo > marcadorRival) {
      partidosGanados++;
      puntos += 3; // Ejemplo: 3 puntos por victoria
    } else if (marcadorEquipo < marcadorRival) {
      partidosPerdidos++;
    } else {
      partidosEmpatados++;
      puntos += 1; // Ejemplo: 1 punto por empate
    }
  }

  // 3. Buscar o crear el documento ParticipacionFase
  let participacion = await ParticipacionFase.findOne({
    equipoCompetencia: equipoCompetenciaId,
    fase: faseId
  });

  if (!participacion) {
    participacion = new ParticipacionFase({
      equipoCompetencia: equipoCompetenciaId,
      fase: faseId,
    });
  }

  // 4. Actualizar estadísticas
  participacion.puntos = puntos;
  participacion.partidosJugados = partidosJugados;
  participacion.partidosGanados = partidosGanados;
  participacion.partidosPerdidos = partidosPerdidos;
  participacion.partidosEmpatados = partidosEmpatados;
  participacion.diferenciaPuntos = diferenciaPuntos;

  await participacion.save();
}