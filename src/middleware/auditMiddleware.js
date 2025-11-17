// middleware/auditMiddleware.js
import { AuditoriaService } from '../services/auditoriaService.js';
import logger from '../utils/logger.js';

/**
 * Middleware to audit modifications to entities
 * @param {string} entidad - Entity name (e.g., 'Partido', 'Equipo', 'Jugador')
 * @param {string} accion - Action being performed ('crear', 'actualizar', 'eliminar')
 * @param {function} getEntidadId - Function to extract entity ID from req (e.g., req => req.params.id)
 * @param {function} getCambios - Optional function to extract changes from req (e.g., req => req.body)
 */
export const auditAction = (entidad, accion, getEntidadId, getCambios = null) => {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;
    const originalJson = res.json;

    // Override response methods to capture successful operations
    const auditAndRespond = async (response) => {
      // Only audit successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const usuario = req.user?.uid || 'sistema';
          const entidadId = getEntidadId ? getEntidadId(req, response) : null;
          const cambios = getCambios ? getCambios(req, response) : req.body;

          await AuditoriaService.registrar(
            usuario,
            entidad,
            entidadId,
            accion,
            cambios,
            req
          );

          logger.info(`Auditoría registrada: ${accion} ${entidad} ${entidadId} por ${usuario}`);
        } catch (error) {
          // Don't fail the request if audit fails, but log the error
          logger.error('Error al registrar auditoría:', error);
        }
      }

      return response;
    };

    res.send = function (data) {
      auditAndRespond(data).finally(() => {
        originalSend.call(this, data);
      });
    };

    res.json = function (data) {
      auditAndRespond(data).finally(() => {
        originalJson.call(this, data);
      });
    };

    next();
  };
};

/**
 * Convenience methods for common audit scenarios
 */
export const auditCreate = (entidad, getEntidadId = (req, res) => res._id?.toString()) =>
  auditAction(entidad, 'crear', getEntidadId);

export const auditUpdate = (entidad, getEntidadId = (req) => req.params.id) =>
  auditAction(entidad, 'actualizar', getEntidadId);

export const auditDelete = (entidad, getEntidadId = (req) => req.params.id) =>
  auditAction(entidad, 'eliminar', getEntidadId, () => ({}));
