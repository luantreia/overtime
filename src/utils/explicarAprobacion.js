/**
 * ¿Puede este usuario aprobar la solicitud, y si no, por qué?
 *
 * Lo usa GET /solicitudes-edicion/:id/aprobadores para habilitar el botón "Aprobar". Antes ese
 * endpoint ignoraba al admin global, que el PUT de aprobación sí deja pasar siempre: el botón
 * salía gris para quien en realidad podía aprobar, sin decir por qué.
 *
 * `motivo` es texto para mostrar al lado del botón deshabilitado.
 */
const QUIEN = {
  equipo: 'un admin del equipo',
  jugador: 'un admin del jugador',
  competencia: 'un admin de la competencia',
  organizacion: 'un admin de la organización',
  partido: 'quien administra el partido',
  global: 'un admin del sistema',
};

export function explicarAprobacion({ estado, esAdminGlobal, uid, grupos }) {
  if (estado !== 'pendiente') {
    return { puedeAprobar: false, motivo: 'Esta solicitud ya fue resuelta.' };
  }
  if (esAdminGlobal) return { puedeAprobar: true, motivo: null };

  const g = grupos || {};
  const esta = Object.values(g).some((ids) => (ids || []).some((id) => String(id) === String(uid)));
  if (esta) return { puedeAprobar: true, motivo: null };

  const quienes = Object.entries(g)
    .filter(([, ids]) => (ids || []).length > 0)
    .map(([clave]) => QUIEN[clave])
    .filter(Boolean);
  const unicos = [...new Set(quienes)];
  const motivo = unicos.length === 0
    ? 'Nadie tiene permiso para aprobarla todavía: la entidad no tiene administradores cargados.'
    : `La puede aprobar ${unicos.length === 1 ? unicos[0] : `${unicos.slice(0, -1).join(', ')} o ${unicos.at(-1)}`}.`;
  return { puedeAprobar: false, motivo };
}
