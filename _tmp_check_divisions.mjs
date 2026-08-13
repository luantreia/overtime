import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const { default: Partido } = await import('./src/models/Partido/Partido.js');

  const faseIds = {
    'Foam Mixto Apertura 2026': '6a7bf746a482cdb5fa2445f5',
    'Foam Mixto Promo 2026': '6a7bf746a482cdb5fa2445f8',
    'Foam Mixto Clausura 2026': '6a7bf746a482cdb5fa2445fb',
    'Cloth Mixta Apertura 2026': '6a7bf748a482cdb5fa244656',
    'Cloth Mixta Promo 2026': '6a7bf748a482cdb5fa244659',
    'Cloth Mixta Clausura 2026': '6a7bf748a482cdb5fa24465c',
  };
  for (const [label, id] of Object.entries(faseIds)) {
    const divisions = await Partido.distinct('division', { fase: id });
    const count = await Partido.countDocuments({ fase: id });
    console.log(`${label}: ${count} partidos, divisiones: ${JSON.stringify(divisions)}`);
  }

  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
