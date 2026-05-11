// services/orgPermissionService.js
import mongoose from 'mongoose';
import Organizacion from '../models/Organizacion.js';
import MiembroOrganizacion from '../models/Organizacion/MiembroOrganizacion.js';
import { orgPermissionImplies, mergeOrgPermissions } from '../constants/orgPermissions.js';

const { Types } = mongoose;

export async function hasOrgPermission({ organizacionId, usuarioId, rolGlobal, permission }) {
  if (!usuarioId || !organizacionId || !Types.ObjectId.isValid(organizacionId)) return false;
  if ((rolGlobal || '').toLowerCase() === 'admin') return true;

  const organizacion = await Organizacion.findById(organizacionId).select('creadoPor administradores').lean();
  if (!organizacion) return false;

  const esCreador = String(organizacion.creadoPor || '') === String(usuarioId);
  const esAdminOrganizacion = (organizacion.administradores || []).some((adminId) => String(adminId) === String(usuarioId));

  if (esCreador || esAdminOrganizacion) return true;

  const miembro = await MiembroOrganizacion.findOne({
    organizacion: organizacionId,
    usuarioId: String(usuarioId),
    estado: 'activo',
  }).select('rol permisos').lean();

  if (!miembro) return false;

  const permisos = mergeOrgPermissions(miembro.rol, miembro.permisos || []);
  return orgPermissionImplies(permisos, permission);
}

export async function getOrganizacionIdFromMiembroOrganizacion(miembroId) {
  if (!miembroId || !Types.ObjectId.isValid(miembroId)) return null;
  const miembro = await MiembroOrganizacion.findById(miembroId).select('organizacion').lean();
  return miembro?.organizacion ? String(miembro.organizacion) : null;
}

export async function getMiembrosActivosByOrganizacion(organizacionId) {
  if (!organizacionId || !Types.ObjectId.isValid(organizacionId)) return [];
  
  const miembros = await MiembroOrganizacion.find({
    organizacion: organizacionId,
    estado: 'activo'
  })
  .populate('usuarioId', 'nombre email')
  .populate('creadoPor', 'nombre email')
  .lean();
  
  return miembros;
}

export async function getMiembroByUsuarioYOrganizacion(usuarioId, organizacionId) {
  if (!usuarioId || !organizacionId) return null;
  
  return await MiembroOrganizacion.findOne({
    organizacion: organizacionId,
    usuarioId: String(usuarioId)
  })
  .populate('usuarioId', 'nombre email')
  .populate('creadoPor', 'nombre email')
  .populate('organizacion', 'nombre')
  .lean();
}
