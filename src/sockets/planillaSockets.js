// src/sockets/planillaSockets.js
//
// Captura simultánea de estadísticas: dos personas con permiso sobre el mismo equipo pueden
// tener la misma planilla (o el mismo set de captura oficial) abierta a la vez y ver en vivo lo
// que la otra va cargando, sin refrescar.
//
// Extraído de server.js para que este archivo (y el de captura oficial, que agrega acá su propio
// par join/leave) no sigan engordando el arranque del proceso. No hay auth global de socket
// (`io.use`) todavía, así que cada join valida el token a mano, igual que haría el middleware
// HTTP `verificarToken` + el chequeo de permiso correspondiente.
import { verifyAccessToken } from '../utils/jwt.js';
import { hasTeamPermission } from '../services/teamPermissionService.js';
import { getEquipoIdFromPlanilla } from '../services/planillaEquipoService.js';
import logger from '../utils/logger.js';

/** Registra los eventos de colaboración en vivo sobre un socket recién conectado. */
export function registerPlanillaSockets(socket) {
  socket.on('planilla:join', async ({ planillaId, token } = {}) => {
    if (!planillaId || !token) return;
    try {
      const decoded = verifyAccessToken(token);
      const equipoId = await getEquipoIdFromPlanilla(planillaId);
      const permitido = await hasTeamPermission({
        equipoId,
        usuarioId: decoded.sub,
        rolGlobal: decoded.rol,
        permission: 'stats.capture',
      });
      if (!permitido) return;
      socket.join(`planilla:${planillaId}`);
      logger.info(`Socket ${socket.id} joined planilla:${planillaId}`);
    } catch (error) {
      logger.warn(`planilla:join rechazado para socket ${socket.id}: ${error.message}`);
    }
  });

  socket.on('planilla:leave', ({ planillaId } = {}) => {
    if (!planillaId) return;
    socket.leave(`planilla:${planillaId}`);
  });

  // Mismo patrón que planilla:join, para la captura oficial (EstadisticasJugadorSet). La sala es
  // por {set, equipo} — no sólo por set — porque `encolarSolicitudStatsLoteSet` ya trata esa
  // pareja como la unidad de aislamiento: la captura de un equipo no debe arrastrar en vivo las
  // filas que está tecleando el rival. El cliente manda `setId`+`equipoId` directo (ya los
  // conoce el modal), no hace falta derivarlos de una fila que puede no existir todavía.
  socket.on('set:join', async ({ setId, equipoId, token } = {}) => {
    if (!setId || !equipoId || !token) return;
    try {
      const decoded = verifyAccessToken(token);
      const permitido = await hasTeamPermission({
        equipoId,
        usuarioId: decoded.sub,
        rolGlobal: decoded.rol,
        permission: 'stats.capture',
      });
      if (!permitido) return;
      socket.join(`set:${setId}:${equipoId}`);
      logger.info(`Socket ${socket.id} joined set:${setId}:${equipoId}`);
    } catch (error) {
      logger.warn(`set:join rechazado para socket ${socket.id}: ${error.message}`);
    }
  });

  socket.on('set:leave', ({ setId, equipoId } = {}) => {
    if (!setId || !equipoId) return;
    socket.leave(`set:${setId}:${equipoId}`);
  });
}
