import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const { default: Partido } = await import('./src/models/Partido/Partido.js');
  const { default: Competencia } = await import('./src/models/Competencia/Competencia.js');
  const { default: Temporada } = await import('./src/models/Competencia/Temporada.js');
  const { default: Fase } = await import('./src/models/Competencia/Fase.js');
  const { default: ParticipacionFase } = await import('./src/models/Equipo/ParticipacionFase.js');

  async function inspect(nombreComp, nombreTemp) {
    const comp = await Competencia.findOne({ nombre: nombreComp }).select('_id').lean();
    const temp = await Temporada.findOne({ competencia: comp._id, nombre: nombreTemp }).select('_id').lean();
    console.log(`\n=== ${nombreComp} / ${nombreTemp} (competencia=${comp._id}, temporada=${temp._id}) ===`);
    const fases = await Fase.find({ temporada: temp._id }).select('nombre tipo orden').lean();
    console.log('Fases:', fases.map(f => `${f.nombre} (${f.tipo}, orden ${f.orden}, id ${f._id})`).join(' | '));

    const sample = await Partido.find({ competencia: comp._id, temporada: temp._id })
      .limit(3)
      .select('fase grupo division jornada participacionFaseLocal participacionFaseVisitante equipoLocal equipoVisitante fecha hora estado')
      .lean();
    for (const p of sample) {
      console.log(JSON.stringify(p, null, 0));
    }

    if (sample[0]?.participacionFaseLocal) {
      const pf = await ParticipacionFase.findById(sample[0].participacionFaseLocal).lean();
      console.log('ParticipacionFase sample:', JSON.stringify(pf));
    }
  }

  await inspect('Liga Cloth Masculino Dodgeball Buenos Aires', '2025');
  await inspect('Liga Foam Mixto Dodgeball Buenos Aires', '2026');
  await inspect('Liga Cloth Mixta Dodgeball Buenos Aires', '2026');

  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
