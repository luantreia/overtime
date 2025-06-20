// middlewares/esAdminDeEquipoDeRelacion.js
import mongoose from 'mongoose';
import JugadorEquipo from '../models/JugadorEquipo.js';
import Equipo from '../models/Equipo.js';

export const esAdminDeEquipoDeRelacion = async (req, res, next) => {
  try {
    const usuarioId = req.user?.uid;
    const rolGlobal = req.user?.rol?.toLowerCase();
    const idRelacion = req.params.id;
    const equipoId = req.body.equipoId || req.query.equipoId;

    if (!usuarioId) {
      return res.status(401).json({ message: 'No autorizado, token inválido o ausente' });
    }

    let equipo = null;

    if (idRelacion) {
      if (!mongoose.Types.ObjectId.isValid(idRelacion)) {
        return res.status(400).json({ message: 'ID de relación inválido' });
      }

      const relacion = await JugadorEquipo.findById(idRelacion);
      if (!relacion) {
        return res.status(404).json({ message: 'Relación no encontrada' });
      }

      equipo = await Equipo.findById(relacion.equipoId);
      if (!equipo) {
        return res.status(404).json({ message: 'Equipo no encontrado' });
      }

      req.relacion = relacion;
    } else if (equipoId) {
      if (!mongoose.Types.ObjectId.isValid(equipoId)) {
        return res.status(400).json({ message: 'ID de equipo inválido' });
      }

      equipo = await Equipo.findById(equipoId);
      if (!equipo) {
        return res.status(404).json({ message: 'Equipo no encontrado' });
      }
    } else {
      return res.status(400).json({ message: 'No se proporcionó ID de relación o equipo' });
    }

    const esCreador = equipo.creadoPor?.toString() === usuarioId;
    const esAdminLocal = equipo.administradores?.some(admin => admin?.toString() === usuarioId);

    if (rolGlobal === 'admin' || esCreador || esAdminLocal) {
      req.equipo = equipo;
      return next();
    }

    return res.status(403).json({ message: 'No tienes permisos sobre este equipo' });
  } catch (error) {
    console.error('Error validando permisos sobre equipo de relación:', error);
    return res.status(500).json({ message: 'Error interno al verificar permisos' });
  }
};
