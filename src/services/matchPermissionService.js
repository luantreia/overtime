// services/matchPermissionService.js
//
// Igual que las otras dos capas de permisos, esto es ADITIVO: mantiene todo lo que ya permitían
// las rutas de partido (admin global, creador y administradores del partido) y suma dos caminos
// nuevos — quien puede gestionar la competencia, y quien tiene una asignación vigente sobre este
// partido o su fase.
import mongoose from 'mongoose';
import Partido from '../models/Partido/Partido.js';
import AsignacionPartido from '../models/Partido/AsignacionPartido.js';
import { hasCompetenciaPermission } from './competenciaPermissionService.js';
import { mergeMatchPermissions, matchPermissionImplies } from '../constants/matchPermissions.js';

const { Types } = mongoose;

export async function hasMatchPermission({ partidoId, usuarioId, rolGlobal, permission }) {
  if (!usuarioId || !partidoId || !Types.ObjectId.isValid(partidoId)) return false;
  if ((rolGlobal || '').toLowerCase() === 'admin') return true;

  const partido = await Partido.findById(partidoId)
    .select('creadoPor administradores competencia fase estado')
    .lean();
  if (!partido) return false;

  // 1) Lo que ya valía antes
  if (String(partido.creadoPor || '') === String(usuarioId)) return true;
  if ((partido.administradores || []).some((a) => String(a) === String(usuarioId))) return true;

  // 2) Quien gestiona la competencia también puede cargar sus partidos
  if (partido.competencia) {
    const puedeCompetencia = await hasCompetenciaPermission({
      competenciaId: String(partido.competencia),
      usuarioId,
      rolGlobal,
      permission: 'matches.approve',
    });
    if (puedeCompetencia) return true;
  }

  // 3) Asignación puntual del partido o del cuerpo estable de la fase.
  //
  // Un partido ya finalizado queda fuera del alcance de las asignaciones: la función del
  // planillero es cargar el partido que se está jugando, no corregir historia. Rectificar un
  // resultado cerrado sigue siendo del organizador (caminos 1 y 2 de arriba), que además tiene
  // el flujo formal de `resultadoPartido` en solicitudes.
  if (partido.estado === 'finalizado') return false;

  const alcance = [{ partido: partidoId }];
  if (partido.fase) alcance.push({ fase: partido.fase });

  const asignaciones = await AsignacionPartido.find({
    usuarioId: String(usuarioId),
    estado: 'activa',
    $or: alcance,
  }).lean();

  const ahora = new Date();
  for (const a of asignaciones) {
    if (a.desde && ahora < new Date(a.desde)) continue;
    if (a.hasta && ahora > new Date(a.hasta)) continue;
    const permisos = mergeMatchPermissions(a.rol, a.permisos || []);
    if (matchPermissionImplies(permisos, permission)) return true;
  }

  return false;
}

/** Asignaciones vigentes de un usuario, para que la app pueda mostrarle "lo que tengo asignado". */
export async function getAsignacionesVigentes(usuarioId, ahora = new Date()) {
  if (!usuarioId) return [];
  const asignaciones = await AsignacionPartido.find({ usuarioId: String(usuarioId), estado: 'activa' })
    .populate('partido', 'fecha estado equipoLocal equipoVisitante competencia fase')
    .populate('fase', 'nombre temporada')
    .lean();

  return asignaciones.filter((a) => {
    if (a.desde && ahora < new Date(a.desde)) return false;
    if (a.hasta && ahora > new Date(a.hasta)) return false;
    return true;
  });
}
