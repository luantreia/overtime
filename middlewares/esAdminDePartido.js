// server/middleware/isAdminDePartido.js
import Partido from '../models/Partido.js';

export const esAdminDePartido = async (req, res, next) => {
  try {
    const { id: partidoId } = req.params;
    const userId = req.usuario?._id; // asumimos que ya está autenticado

    if (!partidoId || !userId) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
    }

    const partido = await Partido.findById(partidoId);

    if (!partido) {
      return res.status(404).json({ error: 'Partido no encontrado.' });
    }

    if (String(partido.adminPartido) !== String(userId)) {
      return res.status(403).json({ error: 'No tienes permisos para modificar este partido.' });
    }

    // todo OK, sigue
    next();
  } catch (error) {
    console.error('Error en isAdminDePartido:', error);
    res.status(500).json({ error: 'Error de servidor.' });
  }
};
