import Auditoria from '../models/Auditoria.js';

export class AuditoriaService {
  static async registrar(usuario, entidad, entidadId, accion, cambios, req) {
    const auditoria = new Auditoria({
      usuario,
      entidad,
      entidadId,
      accion,
      cambios,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    await auditoria.save();
    return auditoria;
  }
}