// constants/orgPermissions.js
export const ORG_PERMISSIONS = [
  'org.*',              // Todos los permisos de organización
  'org.view_private',    // Ver datos privados de organización
  'org.finances',       // Gestión financiera
  'org.settings.manage', // Configuración de organización
  'teams.manage',        // Gestionar equipos de la organización
  'teams.view',         // Ver equipos de la organización
  'teams.create',       // Crear nuevos equipos
  'events.manage',       // Gestionar eventos/competiciones
  'events.create',       // Crear nuevos eventos
  'matches.approve',    // Aprobar partidos
  'matches.referee',    // Arbitrar partidos
  'members.manage',      // Gestionar miembros de organización
  'members.invite',     // Invitar nuevos miembros
  'stats.view_private', // Ver estadísticas privadas
  'stats.manage',       // Gestionar estadísticas de organización
];

export const ORG_MEMBER_ROLE_VALUES = [
  'presidente',
  'secretario', 
  'tesorero',
  'delegado',
  'arbitro',
  'coordinador',
  'staff',
];

export const ORG_ROLE_PERMISSION_PRESETS = {
  presidente: ['org.*'], // Control total
  secretario: ['org.view_private', 'teams.manage', 'teams.view', 'events.manage', 'members.manage', 'stats.view_private'],
  tesorero: ['org.view_private', 'org.finances', 'teams.view', 'stats.view_private'],
  delegado: ['teams.view', 'events.manage', 'matches.approve', 'stats.view_private'],
  arbitro: ['matches.referee', 'events.view', 'teams.view'],
  coordinador: ['events.manage', 'events.create', 'teams.view', 'stats.view_private'],
  staff: ['org.view_private', 'teams.view', 'events.view'],
};

export function resolveOrgRolePermissions(rol = 'staff') {
  return ORG_ROLE_PERMISSION_PRESETS[rol] || [];
}

export function mergeOrgPermissions(rol, extraPermissions = []) {
  const preset = resolveOrgRolePermissions(rol);
  return [...new Set([...(preset || []), ...(extraPermissions || [])])];
}

export function orgPermissionImplies(permissions = [], requiredPermission) {
  if (!requiredPermission) return true;
  if (permissions.includes('org.*')) return true;
  return permissions.includes(requiredPermission);
}
