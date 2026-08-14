// services/competenciaPermissionService.js
//
// Resuelve si un usuario puede gestionar una competencia. Es ADITIVO respecto de lo que ya
// validaban las rutas: mantiene admin global / creador / administradores[] de la competencia,
// y además habilita a los miembros de la organización dueña que tengan el permiso pedido
// (ver constants/orgPermissions.js). Nadie que antes entraba deja de entrar.
import mongoose from 'mongoose';
import Competencia from '../models/Competencia/Competencia.js';
import Temporada from '../models/Competencia/Temporada.js';
import Fase from '../models/Competencia/Fase.js';
import { hasOrgPermission } from './orgPermissionService.js';

const { Types } = mongoose;

export async function hasCompetenciaPermission({ competenciaId, usuarioId, rolGlobal, permission }) {
  if (!usuarioId || !competenciaId || !Types.ObjectId.isValid(competenciaId)) return false;
  if ((rolGlobal || '').toLowerCase() === 'admin') return true;

  const competencia = await Competencia.findById(competenciaId)
    .select('creadoPor administradores organizacion')
    .lean();
  if (!competencia) return false;

  if (String(competencia.creadoPor || '') === String(usuarioId)) return true;
  if ((competencia.administradores || []).some((adminId) => String(adminId) === String(usuarioId))) return true;

  if (competencia.organizacion) {
    return hasOrgPermission({
      organizacionId: String(competencia.organizacion),
      usuarioId,
      rolGlobal,
      permission,
    });
  }

  return false;
}

export async function getCompetenciaIdFromTemporada(temporadaId) {
  if (!temporadaId || !Types.ObjectId.isValid(temporadaId)) return null;
  const temporada = await Temporada.findById(temporadaId).select('competencia').lean();
  return temporada?.competencia ? String(temporada.competencia) : null;
}

export async function getCompetenciaIdFromFase(faseId) {
  if (!faseId || !Types.ObjectId.isValid(faseId)) return null;
  const fase = await Fase.findById(faseId).select('temporada competencia').lean();
  if (!fase) return null;
  if (fase.competencia) return String(fase.competencia);
  return getCompetenciaIdFromTemporada(fase.temporada);
}
