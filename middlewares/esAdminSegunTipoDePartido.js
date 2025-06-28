// middlewares/esAdminSegunTipoPartido.js
import mongoose from 'mongoose';
import Partido from '../models/Partido.js';

export function esAdminSegunTipoPartido() {
  return async (req, res, next) => {
    try {
      const usuarioId = req.user?.uid;
      const rolGlobal = req.user?.rol;

      if (!usuarioId) {
        return res.status(401).json({ message: 'No autorizado, token inválido o ausente' });
      }

      const partidoId = req.params.id;

      if (!partidoId || !mongoose.Types.ObjectId.isValid(partidoId)) {
        return res.status(400).json({ message: 'ID de partido inválido' });
      }

      const partido = await Partido.findById(partidoId);
      if (!partido) {
        return res.status(404).json({ message: 'Partido no encontrado' });
      }

      // Si el usuario es admin global, lo dejamos pasar
      if (rolGlobal === 'admin') {
        req.partido = partido;
        return next();
      }

      const usuarioIdStr = usuarioId.toString();

      if (partido.competencia) {
        // Partido de competencia
        // Aquí validar que el usuario sea admin en la competencia o admin global
        // Asumo que competencia tiene administradores o algún campo para validar
        // Por ejemplo:
        const competenciaId = partido.competencia;

        // Importar modelo Competencia para buscar administradores
        const Competencia = mongoose.model('Competencia');
        const competencia = await Competencia.findById(competenciaId).lean();

        if (!competencia) {
          return res.status(404).json({ message: 'Competencia asociada no encontrada' });
        }

        const esAdminCompetencia =
          competencia.creadoPor?.toString() === usuarioIdStr ||
          (competencia.administradores || []).some(id => id.toString() === usuarioIdStr);

        if (esAdminCompetencia) {
          req.partido = partido;
          return next();
        }

        return res.status(403).json({ message: 'No tienes permisos para administrar este partido de competencia' });
      } else {
        // Partido amistoso, validar creador o admin local (partido.administradores)
        const esCreador = partido.creadoPor?.toString() === usuarioIdStr;
        const esAdminLocal = (partido.administradores || []).some(id => id.toString() === usuarioIdStr);

        if (esCreador || esAdminLocal) {
          req.partido = partido;
          return next();
        }

        return res.status(403).json({ message: 'No tienes permisos para administrar este partido amistoso' });
      }
    } catch (error) {
      console.error('Error en middleware esAdminSegunTipoPartido:', error);
      return res.status(500).json({ message: 'Error interno al verificar permisos' });
    }
  };
}
