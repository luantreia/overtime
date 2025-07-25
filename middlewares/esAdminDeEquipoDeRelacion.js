// middlewares/esAdminDeEquipoDeRelacion.js
import mongoose from 'mongoose';
import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';
import Equipo from '../models/Equipo/Equipo.js';

export const esAdminDeEquipoDeRelacion = async (req, res, next) => {
  try {
    const usuarioId = req.user?.uid;
    const rolGlobal = req.user?.rol?.toLowerCase();
    const idRelacion = req.params.id;
    const equipoId = req.body.equipo || req.query.equipo;

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

      equipo = await Equipo.findById(relacion.equipo);
      if (!equipo) {
        return res.status(404).json({ message: 'Equipo no encontrado' });
      }

      req.relacion = relacion;
    } else if (equipoId) {
      if (!mongoose.Types.ObjectId.isValid(equipoId)) {
        return res.status(400).json({ message: 'ID de equipo inválido' });
      }

      equipo = await Equipo.findById(equipoId)
        .populate('creadoPor', '_id email nombre')
        .populate('administradores', '_id email nombre');
      if (!equipo) {
        return res.status(404).json({ message: 'Equipo no encontrado' });
      }
    } else {
      return res.status(400).json({ message: 'No se proporcionó ID de relación o equipo' });
    }

    const creadoPorId = equipo.creadoPor?._id?.toString() || equipo.creadoPor;
    const esCreador = creadoPorId === usuarioId;

    const administradoresIds = equipo.administradores.map(admin => admin._id?.toString() || admin);
    const esAdminLocal = administradoresIds.includes(usuarioId);

    console.log('--- Permisos Equipo ---');
    console.log('Usuario ID:', usuarioId);
    console.log('Rol global:', rolGlobal);
    console.log('Equipo ID:', equipo?._id?.toString());
    console.log('Equipo creadoPor:', equipo.creadoPor);
    console.log('Equipo administradores:', equipo.administradores);
    console.log('Es creador:', esCreador);
    console.log('Es admin local:', esAdminLocal);

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

