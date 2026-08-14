// constants/matchPermissions.js
//
// Permisos acotados a UN partido (o a todos los de una fase). Existen porque las otras dos capas
// —MiembroEquipo y MiembroOrganizacion— cuelgan de una entidad durable, y un planillero no es
// ninguna de las dos cosas: trabaja en un partido puntual y normalmente es neutral, no pertenece
// a ninguno de los dos equipos.

export const MATCH_PERMISSION_VALUES = [
  'match.lineup',        // cargar quiénes jugaron
  'match.sets',          // cargar sets y sus resultados
  'match.resultado',     // cargar/corregir el marcador del partido
  'match.stats',         // cargar estadísticas individuales
  'match.view_private',  // ver datos no públicos del partido
  'match.*',
];

export const MATCH_MEMBER_ROLE_VALUES = [
  'planillero',
  'arbitro',
  'mesa',
  'veedor',
];

export const MATCH_ROLE_PERMISSION_PRESETS = {
  // El planillero carga la planilla completa: quiénes jugaron, los sets y el resultado.
  planillero: ['match.lineup', 'match.sets', 'match.resultado', 'match.view_private'],
  arbitro: ['match.resultado', 'match.sets', 'match.view_private'],
  mesa: ['match.sets', 'match.stats', 'match.view_private'],
  veedor: ['match.view_private'],
};

export function resolveMatchRolePermissions(rol = 'veedor') {
  return MATCH_ROLE_PERMISSION_PRESETS[rol] || [];
}

export function mergeMatchPermissions(rol, extraPermissions = []) {
  const preset = resolveMatchRolePermissions(rol);
  return [...new Set([...(preset || []), ...(extraPermissions || [])])];
}

export function matchPermissionImplies(permissions = [], requiredPermission) {
  if (!requiredPermission) return true;
  if (permissions.includes('match.*')) return true;
  return permissions.includes(requiredPermission);
}
