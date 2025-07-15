import mongoose from 'mongoose';

export const esAdminDeEntidad = (Modelo, nombreCampoEntidad = 'entidad') => {
  return async (req, res, next) => {
    try {
      const usuarioId = req.user?.uid;
      const rolGlobal = req.user?.rol?.toLowerCase?.();

      if (!usuarioId) {
        return res.status(401).json({ message: 'No autorizado, token inválido o ausente' });
      }

      let idEntidad =
        req.params.id ||
        req.body[`${nombreCampoEntidad}Id`] ||
        (typeof req.body[nombreCampoEntidad] === 'string'
          ? req.body[nombreCampoEntidad]
          : req.body[nombreCampoEntidad]?._id) ||
        req.body.id ||
        req.query[`${nombreCampoEntidad}Id`] ||
        req.query.id;

      if (!idEntidad || !mongoose.Types.ObjectId.isValid(idEntidad)) {
        return res.status(400).json({ message: `ID de ${nombreCampoEntidad} inválido` });
      }

      // Cargo solo los campos necesarios para validar permisos
      const entidad = await Modelo.findById(idEntidad).select('creadoPor administradores');
      if (!entidad) {
        return res.status(404).json({ message: `${nombreCampoEntidad} no encontrada` });
      }

      const esCreador = entidad.creadoPor?.toString() === usuarioId;
      const admins = entidad.administradores || [];
      const esAdmin = admins.some(adminId => adminId?.toString() === usuarioId);

      // Para debugging solo si estamos en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.log('Verificando permisos:', {
          uid: usuarioId,
          rol: rolGlobal,
          entidad: nombreCampoEntidad,
          creadoPor: entidad.creadoPor,
          administradores: admins
        });
      }

      if (rolGlobal === 'admin' || esCreador || esAdmin) {
        req[nombreCampoEntidad] = entidad;
        return next();
      }

      return res.status(403).json({ message: `No tienes permisos sobre esta ${nombreCampoEntidad}` });
    } catch (error) {
      console.error(`Error de permisos en ${nombreCampoEntidad}:`, error);
      return res.status(500).json({ message: `Error interno al verificar permisos de ${nombreCampoEntidad}` });
    }
  };
};
