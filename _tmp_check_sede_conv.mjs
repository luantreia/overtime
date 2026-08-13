import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const { default: Partido } = await import('./src/models/Partido/Partido.js');

  const faseIds = ['6a7bf746a482cdb5fa2445f5', '6a7bf746a482cdb5fa2445fb', '6a7bf748a482cdb5fa244656', '6a7bf748a482cdb5fa24465c', '6a4cd0bfdd2d188bd72ba24a'];
  for (const id of faseIds) {
    const sample = await Partido.find({ fase: id }).limit(2).select('ubicacion cancha sede fecha hora').lean();
    console.log(id, JSON.stringify(sample));
  }
  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
