
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGO_URI || "mongodb+srv://vpiol:calizdefuego@cluster0.43fw2wo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function inspectRankings() {
  try {
    await mongoose.connect(uri, { dbName: 'test' });
    console.log('Connected to MongoDB');

    const PlayerRating = mongoose.models.PlayerRating || mongoose.model('PlayerRating', new mongoose.Schema({
      playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jugador' },
      competenciaId: mongoose.Schema.Types.ObjectId,
      temporadaId: mongoose.Schema.Types.ObjectId,
      modalidad: String,
      categoria: String,
      rating: Number,
      matchesPlayed: Number,
      wins: Number
    }));

    const Jugador = mongoose.models.Jugador || mongoose.model('Jugador', new mongoose.Schema({ nombre: String }));
    const Competencia = mongoose.models.Competencia || mongoose.model('Competencia', new mongoose.Schema({ nombre: String }));

    const ratings = await PlayerRating.find({}).populate('playerId').lean();
    const comps = await Competencia.find({}).lean();
    
    const compMap = comps.reduce((acc, c) => {
      acc[c._id.toString()] = c.nombre;
      return acc;
    }, {});

    console.log(`\nFound ${ratings.length} ranking records.\n`);

    // Group by context
    const contexts = {};
    ratings.forEach(r => {
      const cid = r.competenciaId ? r.competenciaId.toString() : 'global';
      const tid = r.temporadaId ? r.temporadaId.toString() : 'global';
      const key = `${compMap[cid] || cid} | ${tid} | ${r.modalidad} | ${r.categoria}`;
      if (!contexts[key]) contexts[key] = [];
      contexts[key].push(r);
    });

    for (const [key, players] of Object.entries(contexts)) {
      console.log(`--- Context: ${key} ---`);
      const sorted = players.sort((a, b) => b.rating - a.rating);
      sorted.slice(0, 10).forEach((p, idx) => {
        console.log(`${idx + 1}. ${p.playerId?.nombre || 'Unknown'} - Rating: ${Math.round(p.rating)} (Matches: ${p.matchesPlayed}, Wins: ${p.wins})`);
      });
      if (players.length > 10) console.log(`... and ${players.length - 10} more`);
      console.log('\n');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

inspectRankings();
