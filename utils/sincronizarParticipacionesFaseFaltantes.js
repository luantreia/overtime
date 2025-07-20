import ParticipacionTemporada from '../models/Equipo/ParticipacionTemporada.js';
import ParticipacionFase from '../models/Equipo/ParticipacionFase.js';
import Fase from '../models/Competencia/Fase.js';

export async function sincronizarParticipacionesFaseFaltantes() {
  const resultados = [];

  const participaciones = await ParticipacionTemporada.find()
    .populate({
      path: 'temporada',
      populate: { path: 'competencia', select: '_id' }
    });

  for (const pt of participaciones) {
    const temporada = pt.temporada;
    const competenciaId = temporada?.competencia?._id;

    if (!competenciaId) continue;

    const fases = await Fase.find({ competencia: competenciaId });
    if (!fases.length) continue;

    for (const fase of fases) {
      const yaExiste = await ParticipacionFase.findOne({
        participacionTemporada: pt._id,
        fase: fase._id,
      });
      if (yaExiste) continue;

      const nuevaPF = new ParticipacionFase({
        participacionTemporada: pt._id,
        fase: fase._id,
        grupo: fase.tipo === 'grupo' ? 'A' : undefined,
        division: fase.tipo === 'liga' ? '1' : undefined,
      });

      try {
        await nuevaPF.save();
        resultados.push({
          ptId: pt._id,
          fase: fase.nombre,
          creada: true,
        });
      } catch (error) {
        resultados.push({
          ptId: pt._id,
          fase: fase.nombre,
          error: error.message,
        });
      }
    }
  }

  return resultados;
}
