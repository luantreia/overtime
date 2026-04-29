export const TEAM_PERMISSION_VALUES = [
  'stats.capture',
  'stats.edit',
  'stats.view_private',
  'matches.manage',
  'lineup.manage',
  'members.manage',
  'team.settings.manage',
  'team.*',
];

export const TEAM_MEMBER_ROLE_VALUES = [
  'jugador',
  'entrenador',
  'video_analista',
  'preparador_fisico',
  'community_manager',
  'sponsor_manager',
  'staff',
  'otro',
];

export const TEAM_ROLE_PERMISSION_PRESETS = {
  jugador: ['stats.view_private'],
  entrenador: ['stats.capture', 'stats.edit', 'stats.view_private', 'lineup.manage'],
  video_analista: ['stats.capture', 'stats.edit', 'stats.view_private'],
  preparador_fisico: ['stats.view_private'],
  community_manager: [],
  sponsor_manager: [],
  staff: ['stats.capture'],
  otro: [],
};

export function resolveRolePermissions(rol = 'otro') {
  return TEAM_ROLE_PERMISSION_PRESETS[rol] || [];
}

export function mergePermissions(rol, extraPermissions = []) {
  const preset = resolveRolePermissions(rol);
  return [...new Set([...(preset || []), ...(extraPermissions || [])])];
}

export function permissionImplies(permissions = [], requiredPermission) {
  if (!requiredPermission) return true;
  if (permissions.includes('team.*')) return true;
  return permissions.includes(requiredPermission);
}
