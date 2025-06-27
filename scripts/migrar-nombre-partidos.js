import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Partido from '../models/Partido.js';
import Competencia from '../models/Competencia.js';
import Equipo from '../models/Equipo.js';

dotenv.config();
await mongoose.connect(process.env.MONGO_URI);

async function migrarNombrePartidos() {
  const partidos = await Partido.find().populate('competencia equipoLocal equipoVisitante');

  for (const partido of partidos) {
    const nombreLocal = partido.equipoLocal?.nombre || 'Local';
    const nombreVisitante = partido.equipoVisitante?.nombre || 'Visitante';
    const categoria = partido.categoria || '';
    const modalidad = partido.modalidad || '';

    if (partido.competencia) {
      partido.nombrePartido = `${partido.competencia.nombre} - ${nombreLocal} vs ${nombreVisitante}`;
    } else {
      partido.nombrePartido = `${nombreLocal} vs ${nombreVisitante} - ${categoria} - ${modalidad} - Amistoso`;
    }

    await partido.save();
    console.log(`✅ Actualizado: ${partido._id} -> ${partido.nombrePartido}`);
  }

  console.log(`🎉 Migración completada. Total: ${partidos.length} partidos actualizados.`);
  mongoose.disconnect();
}

migrarNombrePartidos().catch((err) => {
  console.error('❌ Error en la migración:', err);
  mongoose.disconnect();
});
