import { hasCompetenciaPermission } from '../services/competenciaPermissionService.js';

/**
 * Valida permisos sobre la competencia dueña de la entidad que se está tocando.
 *
 * Mismo patrón que `requireTeamPermission`, pero para la cadena
 * Competencia → Temporada → Fase → Partido.
 *
 * `allowWhenUnresolved` existe para los partidos amistosos: no cuelgan de ninguna competencia,
 * así que no hay contra qué validar y tienen que seguir siendo libres (los crean DTs y jugadores
 * desde dodgeballmanager y Manager).
 */
export const requireCompetenciaPermission = ({
  permission,
  resolveCompetenciaId,
  allowWhenUnresolved = false,
  missingMessage,
}) => {
  return async (req, res, next) => {
    try {
      const competenciaId = await resolveCompetenciaId(req);

      if (!competenciaId) {
        if (allowWhenUnresolved) return next();
        return res.status(400).json({
          error: missingMessage || 'No se pudo resolver la competencia para validar permisos',
        });
      }

      const allowed = await hasCompetenciaPermission({
        competenciaId,
        usuarioId: req.user?.uid,
        rolGlobal: req.user?.rol,
        permission,
      });

      if (!allowed) {
        return res.status(403).json({ error: 'No tenés permisos suficientes sobre esta competencia' });
      }

      req.competenciaIdPermisos = competenciaId;
      return next();
    } catch (error) {
      console.error('Error validando permisos de competencia:', error);
      return res.status(500).json({ error: 'Error interno validando permisos de competencia' });
    }
  };
};
