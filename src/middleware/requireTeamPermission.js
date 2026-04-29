import { hasTeamPermission } from '../services/teamPermissionService.js';

export const requireTeamPermission = ({ permission, resolveEquipoId, missingMessage }) => {
  return async (req, res, next) => {
    try {
      const equipoId = await resolveEquipoId(req);
      if (!equipoId) {
        return res.status(400).json({ error: missingMessage || 'No se pudo resolver el equipo para validar permisos' });
      }

      const allowed = await hasTeamPermission({
        equipoId,
        usuarioId: req.user?.uid,
        rolGlobal: req.user?.rol,
        permission,
      });

      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permisos suficientes para esta acción en el equipo' });
      }

      req.equipoIdPermisos = equipoId;
      return next();
    } catch (error) {
      console.error('Error validando permisos de equipo:', error);
      return res.status(500).json({ error: 'Error interno validando permisos de equipo' });
    }
  };
};
