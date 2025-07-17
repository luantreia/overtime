// services/equipoCompetenciaService.js
import EquipoCompetencia from '../models/Equipo/EquipoCompetencia.js';

/**
 * Crea un vínculo equipo-competencia si no existe.
 * @param {Object} params
 * @param {String} params.equipo - ID del equipo
 * @param {String} params.competencia - ID de la competencia
 * @param {String} params.creadoPor - UID del usuario que origina la creación
 * @param {String} [params.origen='sistema'] - Origen del vínculo (equipo, competencia, sistema)
 * @returns {Promise<Object>} - Documento de EquipoCompetencia (nuevo o existente)
 */
export async function crearEquipoCompetenciaAuto({ equipo, competencia, creadoPor, origen = 'sistema' }) {
  if (!equipo || !competencia) {
    throw new Error('Faltan parámetros: equipo y competencia son obligatorios');
  }

  const existente = await EquipoCompetencia.findOne({ equipo, competencia });

  if (existente) return existente;

  const nuevo = new EquipoCompetencia({
    equipo,
    competencia,
    estado: 'pendiente',
    origen,
    solicitadoPor: creadoPor,
    creadoPor,
  });

  await nuevo.save();
  return nuevo;
}
