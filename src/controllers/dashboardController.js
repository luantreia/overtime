import Usuario from '../models/Usuario.js';
import Organizacion from '../models/Organizacion.js';
import Equipo from '../models/Equipo/Equipo.js';
import Jugador from '../models/Jugador/Jugador.js';
import Partido from '../models/Partido/Partido.js';

export const getAdminDashboardStats = async (req, res) => {
  try {
    const [usuarios, organizaciones, equipos, jugadores, partidos] = await Promise.all([
      Usuario.countDocuments(),
      Organizacion.countDocuments(),
      Equipo.countDocuments(),
      Jugador.countDocuments(),
      Partido.countDocuments()
    ]);

    res.json({
      usuarios,
      organizaciones,
      equipos,
      jugadores,
      partidos
    });
  } catch (error) {
    console.error('Error getting admin dashboard stats:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas del dashboard' });
  }
};
