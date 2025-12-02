
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGO_URI || "mongodb+srv://vpiol:calizdefuego@cluster0.43fw2wo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function checkData() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Define schemas minimally to avoid model overwrite errors if they exist
    // Using mongoose.models to check if they exist first is safer, but for a script this is fine if we define them once.
    // Actually, since we are in a script, we can just define them.
    
    const Competencia = mongoose.models.Competencia || mongoose.model('Competencia', new mongoose.Schema({ nombre: String }));
    const Fase = mongoose.models.Fase || mongoose.model('Fase', new mongoose.Schema({ nombre: String, temporada: mongoose.Schema.Types.ObjectId }));
    const Partido = mongoose.models.Partido || mongoose.model('Partido', new mongoose.Schema({ 
      nombrePartido: String, 
      competencia: mongoose.Schema.Types.ObjectId,
      fase: mongoose.Schema.Types.ObjectId,
      equipoLocal: mongoose.Schema.Types.ObjectId,
      equipoVisitante: mongoose.Schema.Types.ObjectId,
      rankedMeta: {
        temporadaId: mongoose.Schema.Types.ObjectId
      }
    }));

    const comp = await Competencia.findOne({ nombre: /League Of Dodgeball/i });
    if (!comp) {
      console.log('Competencia not found');
      return;
    }
    console.log('Competencia found:', comp._id, comp.nombre);

    const partidos = await Partido.find({ competencia: comp._id });
    console.log(`Found ${partidos.length} matches for this competition.`);

    for (const p of partidos) {
      console.log(`Match: ${p._id} - Fase: ${p.fase}`);
      console.log(`   -> RankedMeta TemporadaId: ${p.rankedMeta?.temporadaId}`);
      if (p.fase) {
        const f = await Fase.findById(p.fase);
        console.log(`   -> Fase details: ${f ? f.nombre : 'Not found'} - Temporada: ${f ? f.temporada : 'N/A'}`);
      } else {
        console.log(`   -> No Fase assigned.`);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

checkData();
