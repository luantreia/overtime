import Equipo from '../models/Equipo/Equipo.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuditoriaService } from './auditoriaService.js';
import logger from '../utils/logger.js';
import { getPaginationParams } from '../utils/pagination.js';

export class EquipoService {
  
  static async crearEquipo(data, usuarioId) {
    // Validar que no exista equipo con mismo nombre
    const existe = await Equipo.findOne({
      nombre: data.nombre.trim()
    });

    if (existe) {
      throw new AppError('Equipo con ese nombre ya existe', 400);
    }

    const equipo = new Equipo({
      nombre: data.nombre.trim(),
      escudo: data.escudo,
      foto: data.foto,
      creadoPor: usuarioId,
      administradores: [usuarioId],
    });

    await equipo.save();
    
    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId, 
      'Equipo', 
      equipo._id, 
      'CREATE', 
      { before: null, after: equipo }, 
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Equipo creado', { equipoId: equipo._id, userId: usuarioId });
    return equipo;
  }

  static async obtenerEquipoConEstadisticas(equipoId) {
    const equipo = await Equipo.findById(equipoId)
      .populate('administradores', 'email nombre')
      .lean();

    if (!equipo) {
      throw new AppError('Equipo no encontrado', 404);
    }

    return equipo;
  }

  static async actualizarEquipo(equipoId, data, usuarioId) {
    const equipo = await Equipo.findById(equipoId);

    if (!equipo) {
      throw new AppError('Equipo no encontrado', 404);
    }

    // Validar permisos
    const esAdmin = 
      equipo.creadoPor?.toString() === usuarioId || 
      equipo.administradores?.some(a => a.toString() === usuarioId);

    if (!esAdmin) {
      throw new AppError('No tienes permisos para actualizar este equipo', 403);
    }

    // Validar que no exista otro equipo con el mismo nombre
    const nombre = data.nombre?.trim() || equipo.nombre;
    const equipoExistente = await Equipo.findOne({ 
      nombre: nombre, 
      _id: { $ne: equipoId } 
    });

    if (equipoExistente) {
      throw new AppError('Ya existe otro equipo con ese nombre', 400);
    }

    // Preparar datos para actualización
    const datosActualizar = { ...data };
    
    // Validación y limpieza de datos
    if (datosActualizar.nombre && datosActualizar.nombre.trim() === '') {
      throw new AppError('El nombre es obligatorio', 400);
    }

    if ('colores' in datosActualizar && Array.isArray(datosActualizar.colores)) {
      datosActualizar.colores = datosActualizar.colores.filter(c => c);
    }

    if ('federacion' in datosActualizar && (!datosActualizar.federacion || datosActualizar.federacion === '')) {
      datosActualizar.federacion = null;
    }

    if ('pais' in datosActualizar && data.pais === undefined) {
      datosActualizar.pais = '';
    }

    if ('escudo' in datosActualizar && typeof datosActualizar.escudo !== 'string') {
      datosActualizar.escudo = '';
    }

    if ('tipo' in datosActualizar && !datosActualizar.tipo) {
      datosActualizar.tipo = 'club';
    }

    if ('descripcion' in data && !datosActualizar.descripcion) {
      datosActualizar.descripcion = '';
    }

    if ('sitioWeb' in datosActualizar && !datosActualizar.sitioWeb) {
      datosActualizar.sitioWeb = '';
    }

    if ('esSeleccionNacional' in datosActualizar) {
      datosActualizar.esSeleccionNacional = !!datosActualizar.esSeleccionNacional;
    }

    const equipoAnterior = { ...equipo.toObject() };
    Object.assign(equipo, datosActualizar);
    await equipo.save();

    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId,
      'Equipo', 
      equipoId, 
      'UPDATE', 
      { before: equipoAnterior, after: equipo.toObject() }, 
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Equipo actualizado', { equipoId, userId: usuarioId });
    return equipo;
  }

  static async obtenerEquiposPaginados(req) {
    const { page, limit, skip } = getPaginationParams(req);
    
    const total = await Equipo.countDocuments();
    const equipos = await Equipo.find()
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      data: equipos,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        pages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
      },
    };
  }
}