import { tiposSolicitudMeta } from '../config/solicitudesMeta.js';

/**
 * Solicitudes de alta: al aprobarse, el backend crea la entidad con `...datosPropuestos` tal cual
 * (ver el aprobar en routes/solicitudEdicion.js). Si llegan sin los campos que la definen, la
 * solicitud se guarda igual, el aprobador ve "Sin datos adicionales" y aprobar falla recién en el
 * `save()` del modelo. Pasó con `usuario-crear-organizacion`, cuyo formulario no existía en los
 * frontends: se mandaba `datosPropuestos: {}` y el backend lo aceptaba.
 *
 * Los campos obligatorios son los `camposCriticos` del tipo en solicitudesMeta, para no mantener
 * dos listas.
 */
export const TIPOS_ALTA = ['usuario-crear-organizacion', 'usuario-crear-equipo', 'usuario-crear-jugador'];

/** Devuelve los campos críticos que faltan (vacío si está todo, o si el tipo no es de alta). */
export function camposAltaFaltantes(tipo, datosPropuestos) {
  if (!TIPOS_ALTA.includes(tipo)) return [];
  const requeridos = tiposSolicitudMeta[tipo]?.camposCriticos ?? [];
  const datos = datosPropuestos ?? {};
  return requeridos.filter((campo) => {
    const valor = datos[campo];
    return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
  });
}
