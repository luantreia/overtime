// middlewares/esAdminDelEquipo.js

import Equipo from '../models/Equipo.js';

const esAdminDelEquipo = async (req, res, next) => {
  const equipoId = req.params.id;
  const uid = req.user.uid;

  try {
    const equipo = await Equipo.findById(equipoId);
    if (!equipo) {
      return res.status(404).json({ message: 'Equipo no encontrado' });
    }

    if (!equipo.administradores.includes(uid)) {
      return res.status(403).json({ message: 'No sos administrador de este equipo' });
    }

    req.equipo = equipo;
    next();
  } catch (error) {
    console.error('Error en esAdminDelEquipo:', error);
    res.status(500).json({ message: 'Error de servidor' });
  }
};

export default esAdminDelEquipo;