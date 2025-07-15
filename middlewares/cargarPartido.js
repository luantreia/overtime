// middlewares/cargarPartido.js
import Partido from '../models/Partido/Partido.js';

export const cargarPartido = async (req, res, next) => {
  try {
    const idPartido = req.params.id;

    if (!idPartido) {
      return res.status(400).json({ message: 'Falta el ID del partido en la ruta.' });
    }

    const partido = await Partido.findById(idPartido)
      .populate('equipoLocal', 'nombre escudo')
      .populate('equipoVisitante', 'nombre escudo');

    if (!partido) {
      return res.status(404).json({ message: 'Partido no encontrado.' });
    }

    req.partido = partido;
    next();
  } catch (error) {
    console.error('Error cargando partido:', error);
    return res.status(500).json({ message: 'Error interno al cargar el partido.' });
  }
};
