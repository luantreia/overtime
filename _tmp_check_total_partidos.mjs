import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const { default: Partido } = await import('./src/models/Partido/Partido.js');

  const total = await Partido.countDocuments({});
  console.log('Total Partido en toda la DB:', total);

  const masReciente = await Partido.find({}).sort({ fecha: -1 }).limit(5).select('fecha nombrePartido estado').lean();
  console.log('\n5 mas recientes por fecha:');
  masReciente.forEach(p => console.log(' ', p.fecha, p.nombrePartido, p.estado));

  // Que fecha tiene el partido #1000 si ordenamos ascendente (o sea, el ultimo que entra en el limit=1000 del front)
  const fila1000 = await Partido.find({}).sort({ fecha: 1 }).skip(999).limit(1).select('fecha nombrePartido').lean();
  console.log('\nPartido #1000 (orden ascendente por fecha) - todo despues de esta fecha queda afuera del limit=1000 del frontend:');
  console.log(' ', fila1000[0]?.fecha, fila1000[0]?.nombrePartido);

  await mongoose.disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
