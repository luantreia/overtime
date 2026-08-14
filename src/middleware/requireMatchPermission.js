import { hasMatchPermission } from '../services/matchPermissionService.js';

/**
 * Valida permisos sobre un partido puntual. Mismo patrón que `requireTeamPermission` y
 * `requireCompetenciaPermission`.
 */
export const requireMatchPermission = ({
  permission,
  resolvePartidoId = (req) => req.params.id,
  allowWhenUnresolved = false,
  missingMessage,
}) => {
  return async (req, res, next) => {
    try {
      const partidoId = await resolvePartidoId(req);

      if (!partidoId) {
        if (allowWhenUnresolved) return next();
        return res.status(400).json({
          error: missingMessage || 'No se pudo resolver el partido para validar permisos',
        });
      }

      const allowed = await hasMatchPermission({
        partidoId,
        usuarioId: req.user?.uid,
        rolGlobal: req.user?.rol,
        permission,
      });

      if (!allowed) {
        return res.status(403).json({ error: 'No tenés permisos suficientes sobre este partido' });
      }

      req.partidoIdPermisos = partidoId;
      return next();
    } catch (error) {
      console.error('Error validando permisos de partido:', error);
      return res.status(500).json({ error: 'Error interno validando permisos de partido' });
    }
  };
};
