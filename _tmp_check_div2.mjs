import 'dotenv/config';
import mongoose from 'mongoose';
async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const { default: Partido } = await import('./src/models/Partido/Partido.js');
  for (const id of ['6a4cd0bfdd2d188bd72ba24a', '6a4cd0fbdd2d188bd72ba255']) {
    console.log(id, await Partido.distinct('division', { fase: id }));
  }
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
