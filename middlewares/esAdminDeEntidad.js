import mongoose from 'mongoose';

export const esAdminDeEntidad = (Modelo, nombreCampoEntidad = 'entidad') => {
  return async (req, res, next) => {
    try {
      const usuarioId = req.user?.uid;
      const rolGlobal = req.user?.rol;

      if (!usuarioId) {
        return res.status(401).json({ message: 'No autorizado, token inválido o ausente' });
      }
      const idEntidad =
        req.params.id ||
        req.body[`${nombreCampoEntidad}Id`] ||
        req.body[nombreCampoEntidad] ||    // <--- esta línea agregada
        req.body.id ||
        req.query[`${nombreCampoEntidad}Id`] ||
        req.query.id;

      if (!idEntidad || !mongoose.Types.ObjectId.isValid(idEntidad)) {
        return res.status(400).json({ message: `ID de ${nombreCampoEntidad} inválido` });
      }

      const entidad = await Modelo.findById(idEntidad);
      if (!entidad) {
        return res.status(404).json({ message: `${nombreCampoEntidad} no encontrada` });
      }

      const esCreador = entidad.creadoPor?.toString() === usuarioId;
      const esAdmin = entidad.administradores?.some(
        adminId => adminId?.toString() === usuarioId
      );
      console.log('Verificando permisos:', {
        uid: req.user?.uid,
        rol: req.user?.rol,
        entidad: nombreCampoEntidad,
        creadoPor: entidad.creadoPor,
        administradores: entidad.administradores
      });
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
